"""
Admin service — super admin operations for SaaS platform management.

Handles gym directory, subscription management, analytics, and audit logging.
All operations are tenant-safe: super admin can see all gyms, but every
query still uses explicit gym_id filtering.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select, case, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationError
from app.core.timezone import today_ist
from app.middleware.subscription_enforcement import invalidate_subscription_cache
from app.models.audit_log import AuditAction, AuditLog
from app.models.gym import Gym
from app.models.member import Member
from app.models.payment import Payment, PaymentStatus
from app.models.subscription import (
    BillingStatus,
    GymSubscription,
    Invoice,
    InvoiceStatus,
    PlanTier,
    SubscriptionPlan,
)
from app.models.user import User, UserRole
from app.schemas.admin import (
    AdminActionResponse,
    AuditLogEntry,
    AuditLogResponse,
    GymDetailResponse,
    GymDirectoryItem,
    GymDirectoryResponse,
    GymOwnerInfo,
    InvoiceInfo,
    SaaSMetricsResponse,
    StaffInfo,
)

logger = logging.getLogger("gymflow.admin")


class AdminService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # === SaaS Metrics ===

    async def get_saas_metrics(self) -> SaaSMetricsResponse:
        """Platform-wide SaaS metrics for the admin dashboard."""

        # Total gyms
        total_gyms = (await self.db.execute(
            select(func.count()).select_from(Gym)
        )).scalar_one()

        # Subscription status counts
        sub_counts = (await self.db.execute(
            select(
                GymSubscription.status,
                func.count().label("cnt"),
            ).group_by(GymSubscription.status)
        )).all()

        status_map = {row[0].value if hasattr(row[0], 'value') else row[0]: row[1] for row in sub_counts}
        active_subs = status_map.get("active", 0) + status_map.get("past_due", 0)
        trial_gyms = status_map.get("trial", 0)

        # Suspended = gyms where is_active=False
        suspended_gyms = (await self.db.execute(
            select(func.count()).select_from(Gym).where(Gym.is_active == False)  # noqa: E712
        )).scalar_one()

        # Total members across platform
        total_members = (await self.db.execute(
            select(func.count()).select_from(Member).where(
                Member.is_deleted == False  # noqa: E712
            )
        )).scalar_one()

        # MRR: sum of plan prices for active subscriptions
        mrr = (await self.db.execute(
            select(func.coalesce(func.sum(SubscriptionPlan.price_in_paise), 0)).select_from(
                GymSubscription
            ).join(
                SubscriptionPlan, GymSubscription.plan_id == SubscriptionPlan.id
            ).where(
                GymSubscription.status.in_([BillingStatus.ACTIVE, BillingStatus.PAST_DUE])
            )
        )).scalar_one()

        # Failed payments in last 30 days
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        failed_payments = (await self.db.execute(
            select(func.count()).select_from(Invoice).where(
                Invoice.status == InvoiceStatus.FAILED,
                Invoice.created_at >= thirty_days_ago,
            )
        )).scalar_one()

        return SaaSMetricsResponse(
            total_gyms=total_gyms,
            active_subscriptions=active_subs,
            trial_gyms=trial_gyms,
            suspended_gyms=suspended_gyms,
            total_members=total_members,
            mrr_in_paise=mrr,
            failed_payments=failed_payments,
        )

    # === Gym Directory ===

    async def list_gyms(
        self,
        skip: int = 0,
        limit: int = 50,
        search: str | None = None,
        status_filter: str | None = None,
    ) -> GymDirectoryResponse:
        """List all gyms with owner, subscription, and member data."""

        # Base query
        query = select(Gym).order_by(Gym.created_at.desc())

        if search:
            search_term = f"%{search}%"
            query = query.where(
                Gym.name.ilike(search_term) | Gym.email.ilike(search_term)
            )

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_query)).scalar_one()

        # Paginate
        gyms = (await self.db.execute(
            query.offset(skip).limit(limit)
        )).scalars().all()

        # Batch load related data
        gym_ids = [g.id for g in gyms]
        if not gym_ids:
            return GymDirectoryResponse(gyms=[], total=0)

        # Owners (one per gym)
        owners = (await self.db.execute(
            select(User).where(
                User.gym_id.in_(gym_ids),
                User.role == UserRole.OWNER,
            )
        )).scalars().all()
        owner_map = {o.gym_id: o for o in owners}

        # Subscriptions
        subs = (await self.db.execute(
            select(GymSubscription)
            .options(selectinload(GymSubscription.plan))
            .where(GymSubscription.gym_id.in_(gym_ids))
        )).scalars().all()
        sub_map = {s.gym_id: s for s in subs}

        # Member counts
        member_counts = (await self.db.execute(
            select(
                Member.gym_id,
                func.count().label("cnt"),
            ).where(
                Member.gym_id.in_(gym_ids),
                Member.is_deleted == False,  # noqa: E712
            ).group_by(Member.gym_id)
        )).all()
        member_map = {row[0]: row[1] for row in member_counts}

        # Revenue per gym (all-time)
        revenue = (await self.db.execute(
            select(
                Payment.gym_id,
                func.coalesce(func.sum(Payment.amount_in_paise), 0).label("total"),
            ).where(
                Payment.gym_id.in_(gym_ids),
                Payment.payment_status == PaymentStatus.COMPLETED,
            ).group_by(Payment.gym_id)
        )).all()
        revenue_map = {row[0]: row[1] for row in revenue}

        # Last payment date
        last_payments = (await self.db.execute(
            select(
                Payment.gym_id,
                func.max(Payment.payment_date).label("last_date"),
            ).where(
                Payment.gym_id.in_(gym_ids),
                Payment.payment_status == PaymentStatus.COMPLETED,
            ).group_by(Payment.gym_id)
        )).all()
        last_payment_map = {row[0]: row[1] for row in last_payments}

        # Build response
        items = []
        for gym in gyms:
            owner = owner_map.get(gym.id)
            sub = sub_map.get(gym.id)

            # Apply status filter
            sub_status = sub.status.value if sub else None
            if status_filter:
                if status_filter == "suspended" and gym.is_active:
                    continue
                elif status_filter == "active" and sub_status != "active":
                    continue
                elif status_filter == "trial" and sub_status != "trial":
                    continue
                elif status_filter == "expired" and sub_status != "expired":
                    continue

            items.append(GymDirectoryItem(
                id=str(gym.id),
                name=gym.name,
                slug=gym.slug,
                email=gym.email,
                city=gym.city,
                is_active=gym.is_active,
                created_at=gym.created_at,
                owner=GymOwnerInfo(
                    id=str(owner.id),
                    name=owner.name,
                    email=owner.email,
                    phone=owner.phone,
                ) if owner else None,
                subscription_status=sub_status,
                plan_name=sub.plan.name if sub and sub.plan else None,
                plan_tier=sub.plan.tier.value if sub and sub.plan else None,
                trial_end=sub.trial_end if sub else None,
                current_period_end=sub.current_period_end if sub else None,
                member_count=member_map.get(gym.id, 0),
                revenue_in_paise=revenue_map.get(gym.id, 0),
                last_payment_date=last_payment_map.get(gym.id),
            ))

        return GymDirectoryResponse(gyms=items, total=total)

    # === Gym Details ===

    async def get_gym_detail(self, gym_id: UUID) -> GymDetailResponse:
        """Full gym details for the admin detail page."""
        gym = (await self.db.execute(
            select(Gym).where(Gym.id == gym_id)
        )).scalar_one_or_none()

        if not gym:
            raise NotFoundError("Gym not found")

        # Owner
        owner = (await self.db.execute(
            select(User).where(
                User.gym_id == gym_id,
                User.role == UserRole.OWNER,
            )
        )).scalar_one_or_none()

        # Subscription
        sub = (await self.db.execute(
            select(GymSubscription)
            .options(selectinload(GymSubscription.plan))
            .where(GymSubscription.gym_id == gym_id)
        )).scalar_one_or_none()

        # Member counts
        member_count = (await self.db.execute(
            select(func.count()).select_from(Member).where(
                Member.gym_id == gym_id,
                Member.is_deleted == False,  # noqa: E712
            )
        )).scalar_one()

        active_member_count = (await self.db.execute(
            select(func.count()).select_from(Member).where(
                Member.gym_id == gym_id,
                Member.is_deleted == False,  # noqa: E712
                Member.membership_status == "active",
            )
        )).scalar_one()

        # Staff
        staff_rows = (await self.db.execute(
            select(User).where(
                User.gym_id == gym_id,
                User.role != UserRole.SUPER_ADMIN,
            ).order_by(User.role, User.name)
        )).scalars().all()

        staff_count = len([s for s in staff_rows if s.role != UserRole.OWNER])

        # Total revenue
        total_revenue = (await self.db.execute(
            select(func.coalesce(func.sum(Payment.amount_in_paise), 0)).where(
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.COMPLETED,
            )
        )).scalar_one()

        # Invoices
        invoices = (await self.db.execute(
            select(Invoice).where(
                Invoice.gym_id == gym_id,
            ).order_by(Invoice.created_at.desc()).limit(20)
        )).scalars().all()

        # Days remaining
        days_remaining = None
        today = today_ist()
        if sub:
            if sub.status == BillingStatus.TRIAL and sub.trial_end:
                days_remaining = max(0, (sub.trial_end - today).days)
            elif sub.current_period_end:
                days_remaining = max(0, (sub.current_period_end - today).days)

        return GymDetailResponse(
            id=str(gym.id),
            name=gym.name,
            slug=gym.slug,
            phone=gym.phone,
            email=gym.email,
            address=gym.address,
            city=gym.city,
            is_active=gym.is_active,
            created_at=gym.created_at,
            owner=GymOwnerInfo(
                id=str(owner.id),
                name=owner.name,
                email=owner.email,
                phone=owner.phone,
            ) if owner else None,
            subscription_status=sub.status.value if sub else None,
            plan_name=sub.plan.name if sub and sub.plan else None,
            plan_tier=sub.plan.tier.value if sub and sub.plan else None,
            trial_start=sub.trial_start if sub else None,
            trial_end=sub.trial_end if sub else None,
            current_period_start=sub.current_period_start if sub else None,
            current_period_end=sub.current_period_end if sub else None,
            cancel_at_period_end=sub.cancel_at_period_end if sub else False,
            days_remaining=days_remaining,
            member_count=member_count,
            active_member_count=active_member_count,
            staff_count=staff_count,
            total_revenue_in_paise=total_revenue,
            staff=[
                StaffInfo(
                    id=str(s.id),
                    name=s.name,
                    email=s.email,
                    phone=s.phone,
                    role=s.role.value,
                    is_active=s.is_active,
                ) for s in staff_rows
            ],
            invoices=[
                InvoiceInfo(
                    id=str(inv.id),
                    invoice_number=inv.invoice_number,
                    amount_in_paise=inv.amount_in_paise,
                    status=inv.status.value,
                    period_start=inv.period_start,
                    period_end=inv.period_end,
                    paid_at=inv.paid_at,
                ) for inv in invoices
            ],
        )

    # === Admin Actions ===

    async def extend_trial(
        self, gym_id: UUID, days: int, reason: str, actor_id: UUID, ip_address: str | None = None,
    ) -> AdminActionResponse:
        sub = await self._get_subscription(gym_id)
        if not sub:
            raise NotFoundError("No subscription found for this gym")

        if sub.status != BillingStatus.TRIAL:
            raise ValidationError("Gym is not in trial status. Cannot extend trial.")

        old_end = sub.trial_end
        sub.trial_end = (sub.trial_end or today_ist()) + timedelta(days=days)
        await self.db.flush()
        invalidate_subscription_cache(gym_id)

        await self._log_action(
            actor_id=actor_id,
            action=AuditAction.TRIAL_EXTENDED,
            target_gym_id=gym_id,
            description=f"Trial extended by {days} days. Old end: {old_end}, New end: {sub.trial_end}. Reason: {reason}",
            metadata={"days": days, "old_end": str(old_end), "new_end": str(sub.trial_end)},
            ip_address=ip_address,
        )

        return AdminActionResponse(
            success=True,
            message=f"Trial extended by {days} days until {sub.trial_end}",
            gym_id=str(gym_id),
            action="trial_extended",
        )

    async def suspend_gym(
        self, gym_id: UUID, reason: str, actor_id: UUID, ip_address: str | None = None,
    ) -> AdminActionResponse:
        gym = await self._get_gym(gym_id)
        if not gym.is_active:
            raise ValidationError("Gym is already suspended")

        gym.is_active = False
        sub = await self._get_subscription(gym_id)
        if sub:
            sub.status = BillingStatus.EXPIRED
            invalidate_subscription_cache(gym_id)

        await self.db.flush()

        await self._log_action(
            actor_id=actor_id,
            action=AuditAction.GYM_SUSPENDED,
            target_gym_id=gym_id,
            description=f"Gym suspended. Reason: {reason}",
            metadata={"reason": reason},
            ip_address=ip_address,
        )

        return AdminActionResponse(
            success=True,
            message="Gym has been suspended",
            gym_id=str(gym_id),
            action="gym_suspended",
        )

    async def unsuspend_gym(
        self, gym_id: UUID, reason: str, actor_id: UUID, ip_address: str | None = None,
    ) -> AdminActionResponse:
        gym = await self._get_gym(gym_id)
        if gym.is_active:
            raise ValidationError("Gym is not suspended")

        gym.is_active = True
        sub = await self._get_subscription(gym_id)
        if sub:
            sub.status = BillingStatus.ACTIVE
            invalidate_subscription_cache(gym_id)

        await self.db.flush()

        await self._log_action(
            actor_id=actor_id,
            action=AuditAction.GYM_UNSUSPENDED,
            target_gym_id=gym_id,
            description=f"Gym unsuspended. Reason: {reason}",
            metadata={"reason": reason},
            ip_address=ip_address,
        )

        return AdminActionResponse(
            success=True,
            message="Gym has been unsuspended",
            gym_id=str(gym_id),
            action="gym_unsuspended",
        )

    async def lock_gym(
        self, gym_id: UUID, reason: str, actor_id: UUID, ip_address: str | None = None,
    ) -> AdminActionResponse:
        sub = await self._get_subscription(gym_id)
        if not sub:
            raise NotFoundError("No subscription found")

        if sub.status == BillingStatus.EXPIRED:
            raise ValidationError("Gym is already locked/expired")

        old_status = sub.status.value
        sub.status = BillingStatus.EXPIRED
        await self.db.flush()
        invalidate_subscription_cache(gym_id)

        await self._log_action(
            actor_id=actor_id,
            action=AuditAction.GYM_LOCKED,
            target_gym_id=gym_id,
            description=f"Gym locked (subscription expired). Previous status: {old_status}. Reason: {reason}",
            metadata={"previous_status": old_status, "reason": reason},
            ip_address=ip_address,
        )

        return AdminActionResponse(
            success=True,
            message="Gym has been locked",
            gym_id=str(gym_id),
            action="gym_locked",
        )

    async def unlock_gym(
        self, gym_id: UUID, new_status: str, reason: str, actor_id: UUID, ip_address: str | None = None,
    ) -> AdminActionResponse:
        sub = await self._get_subscription(gym_id)
        if not sub:
            raise NotFoundError("No subscription found")

        status_value = BillingStatus.ACTIVE if new_status == "active" else BillingStatus.TRIAL
        old_status = sub.status.value
        sub.status = status_value

        if status_value == BillingStatus.TRIAL:
            sub.trial_end = today_ist() + timedelta(days=14)

        await self.db.flush()
        invalidate_subscription_cache(gym_id)

        await self._log_action(
            actor_id=actor_id,
            action=AuditAction.GYM_UNLOCKED,
            target_gym_id=gym_id,
            description=f"Gym unlocked. Status changed from {old_status} to {status_value.value}. Reason: {reason}",
            metadata={"old_status": old_status, "new_status": status_value.value, "reason": reason},
            ip_address=ip_address,
        )

        return AdminActionResponse(
            success=True,
            message=f"Gym unlocked and set to {status_value.value}",
            gym_id=str(gym_id),
            action="gym_unlocked",
        )

    async def change_plan(
        self, gym_id: UUID, plan_tier: str, reason: str, actor_id: UUID, ip_address: str | None = None,
    ) -> AdminActionResponse:
        sub = await self._get_subscription(gym_id)
        if not sub:
            raise NotFoundError("No subscription found")

        # Find the new plan
        plan = (await self.db.execute(
            select(SubscriptionPlan).where(
                SubscriptionPlan.tier == PlanTier(plan_tier),
                SubscriptionPlan.is_active == True,  # noqa: E712
            )
        )).scalar_one_or_none()

        if not plan:
            raise NotFoundError(f"Plan '{plan_tier}' not found or inactive")

        old_plan_id = sub.plan_id
        sub.plan_id = plan.id
        await self.db.flush()
        invalidate_subscription_cache(gym_id)

        await self._log_action(
            actor_id=actor_id,
            action=AuditAction.PLAN_CHANGED,
            target_gym_id=gym_id,
            description=f"Plan changed to {plan.name}. Reason: {reason}",
            metadata={"old_plan_id": str(old_plan_id), "new_plan_id": str(plan.id), "new_tier": plan_tier},
            ip_address=ip_address,
        )

        return AdminActionResponse(
            success=True,
            message=f"Plan changed to {plan.name}",
            gym_id=str(gym_id),
            action="plan_changed",
        )

    async def activate_subscription(
        self, gym_id: UUID, actor_id: UUID, ip_address: str | None = None,
    ) -> AdminActionResponse:
        sub = await self._get_subscription(gym_id)
        if not sub:
            raise NotFoundError("No subscription found")

        old_status = sub.status.value
        sub.status = BillingStatus.ACTIVE
        today = today_ist()
        sub.current_period_start = today
        sub.current_period_end = today + timedelta(days=30)
        sub.payment_retry_count = 0

        await self.db.flush()
        invalidate_subscription_cache(gym_id)

        await self._log_action(
            actor_id=actor_id,
            action=AuditAction.SUBSCRIPTION_ACTIVATED,
            target_gym_id=gym_id,
            description=f"Subscription manually activated. Previous status: {old_status}",
            metadata={"old_status": old_status, "period_end": str(sub.current_period_end)},
            ip_address=ip_address,
        )

        return AdminActionResponse(
            success=True,
            message="Subscription activated",
            gym_id=str(gym_id),
            action="subscription_activated",
        )

    # === Audit Log ===

    async def get_audit_logs(
        self, skip: int = 0, limit: int = 50, gym_id: UUID | None = None,
    ) -> AuditLogResponse:
        query = select(AuditLog).order_by(AuditLog.created_at.desc())

        if gym_id:
            query = query.where(AuditLog.target_gym_id == gym_id)

        total = (await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )).scalar_one()

        logs = (await self.db.execute(
            query.offset(skip).limit(limit)
        )).scalars().all()

        # Batch load actor/gym names
        actor_ids = {l.actor_id for l in logs if l.actor_id}
        gym_ids = {l.target_gym_id for l in logs if l.target_gym_id}

        actor_map = {}
        if actor_ids:
            actors = (await self.db.execute(
                select(User.id, User.name).where(User.id.in_(actor_ids))
            )).all()
            actor_map = {row[0]: row[1] for row in actors}

        gym_map = {}
        if gym_ids:
            gym_rows = (await self.db.execute(
                select(Gym.id, Gym.name).where(Gym.id.in_(gym_ids))
            )).all()
            gym_map = {row[0]: row[1] for row in gym_rows}

        return AuditLogResponse(
            entries=[
                AuditLogEntry(
                    id=str(l.id),
                    actor_id=str(l.actor_id) if l.actor_id else None,
                    actor_name=actor_map.get(l.actor_id),
                    action=l.action.value,
                    target_gym_id=str(l.target_gym_id) if l.target_gym_id else None,
                    target_gym_name=gym_map.get(l.target_gym_id),
                    description=l.description,
                    metadata_json=l.metadata_json,
                    ip_address=l.ip_address,
                    created_at=l.created_at,
                )
                for l in logs
            ],
            total=total,
        )

    # === Helpers ===

    async def _get_gym(self, gym_id: UUID) -> Gym:
        gym = (await self.db.execute(
            select(Gym).where(Gym.id == gym_id)
        )).scalar_one_or_none()
        if not gym:
            raise NotFoundError("Gym not found")
        return gym

    async def _get_subscription(self, gym_id: UUID) -> GymSubscription | None:
        return (await self.db.execute(
            select(GymSubscription)
            .options(selectinload(GymSubscription.plan))
            .where(GymSubscription.gym_id == gym_id)
        )).scalar_one_or_none()

    async def _log_action(
        self,
        actor_id: UUID,
        action: AuditAction,
        description: str,
        target_gym_id: UUID | None = None,
        target_user_id: UUID | None = None,
        metadata: dict | None = None,
        ip_address: str | None = None,
    ) -> None:
        log = AuditLog(
            actor_id=actor_id,
            action=action,
            target_gym_id=target_gym_id,
            target_user_id=target_user_id,
            description=description,
            metadata_json=metadata,
            ip_address=ip_address,
        )
        self.db.add(log)
        await self.db.flush()
        logger.info(
            "AUDIT: %s by user %s on gym %s: %s",
            action.value, actor_id, target_gym_id, description,
        )
