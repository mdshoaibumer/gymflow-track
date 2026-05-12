"""
Admin service — super admin operations for SaaS platform management.

Handles gym directory, subscription management, analytics, health monitoring,
platform settings, impersonation, and audit logging.
All operations are tenant-safe: super admin can see all gyms, but every
query still uses explicit gym_id filtering.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationError
from app.core.timezone import today_ist
from app.middleware.subscription_enforcement import invalidate_subscription_cache
from app.models import (
    AuditAction, AuditLog, Gym, Member, Payment, PaymentStatus,
    PlatformSettings, BillingStatus, GymSubscription, Invoice, InvoiceStatus,
    PlanTier, SubscriptionPlan, User, UserRole
)
from app.schemas.admin import (
    AdminActionResponse,
    AuditLogEntry,
    AuditLogResponse,
    GymDetailResponse,
    GymDirectoryItem,
    GymDirectoryResponse,
    GymOwnerInfo,
    GrowthTrendPoint,
    HealthAlert,
    InvoiceInfo,
    PlanDistributionItem,
    PlatformAnalyticsResponse,
    PlatformHealthResponse,
    PlatformSettingsResponse,
    SaaSMetricsResponse,
    StaffInfo,
    SubscriptionTimelineEntry,
    UpdatePlatformSettingsRequest,
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
        locked_gyms = status_map.get("expired", 0)

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

        # ARR = MRR * 12
        arr = mrr * 12

        # Failed payments in last 30 days
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        failed_payments = (await self.db.execute(
            select(func.count()).select_from(Invoice).where(
                Invoice.status == InvoiceStatus.FAILED,
                Invoice.created_at >= thirty_days_ago,
            )
        )).scalar_one()

        # Plan distribution: count of active+trial subscriptions per plan
        plan_dist_rows = (await self.db.execute(
            select(
                SubscriptionPlan.tier,
                SubscriptionPlan.name,
                func.count().label("cnt"),
            )
            .select_from(GymSubscription)
            .join(SubscriptionPlan, GymSubscription.plan_id == SubscriptionPlan.id)
            .where(
                GymSubscription.status.in_([
                    BillingStatus.ACTIVE,
                    BillingStatus.TRIAL,
                    BillingStatus.PAST_DUE,
                ])
            )
            .group_by(SubscriptionPlan.tier, SubscriptionPlan.name)
        )).all()
        plan_distribution = [
            PlanDistributionItem(
                tier=row[0].value if hasattr(row[0], 'value') else row[0],
                name=row[1],
                count=row[2],
            )
            for row in plan_dist_rows
        ]

        # Gym growth trend: count of gyms created per month (last 12 months)
        twelve_months_ago = datetime.now(timezone.utc) - timedelta(days=365)
        gym_growth_trend = await self._get_monthly_counts(
            Gym, Gym.created_at, twelve_months_ago
        )

        # Revenue trend: sum of completed payments per month (last 12 months)
        revenue_trend = await self._get_monthly_revenue_trend(twelve_months_ago)

        return SaaSMetricsResponse(
            total_gyms=total_gyms,
            active_subscriptions=active_subs,
            trial_gyms=trial_gyms,
            suspended_gyms=suspended_gyms,
            locked_gyms=locked_gyms,
            total_members=total_members,
            mrr_in_paise=mrr,
            arr_in_paise=arr,
            failed_payments=failed_payments,
            plan_distribution=plan_distribution,
            gym_growth_trend=gym_growth_trend,
            revenue_trend=revenue_trend,
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

        # Active staff counts
        staff_counts = (await self.db.execute(
            select(
                User.gym_id,
                func.count().label("cnt"),
            ).where(
                User.gym_id.in_(gym_ids),
                User.role.in_([UserRole.ADMIN, UserRole.STAFF]),
                User.is_active == True,  # noqa: E712
            ).group_by(User.gym_id)
        )).all()
        staff_map = {row[0]: row[1] for row in staff_counts}

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
                active_staff=staff_map.get(gym.id, 0),
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

        # Subscription timeline (audit log events for this gym)
        timeline_actions = [
            AuditAction.SUBSCRIPTION_ACTIVATED,
            AuditAction.SUBSCRIPTION_CANCELLED,
            AuditAction.PLAN_CHANGED,
            AuditAction.TRIAL_EXTENDED,
            AuditAction.GYM_SUSPENDED,
            AuditAction.GYM_UNSUSPENDED,
            AuditAction.GYM_LOCKED,
            AuditAction.GYM_UNLOCKED,
            AuditAction.PAYMENT_MARKED_RECEIVED,
        ]
        timeline_rows = (await self.db.execute(
            select(AuditLog).where(
                AuditLog.target_gym_id == gym_id,
                AuditLog.action.in_([a.value for a in timeline_actions]),
            ).order_by(AuditLog.created_at.desc()).limit(50)
        )).scalars().all()
        subscription_timeline = [
            SubscriptionTimelineEntry(
                date=row.created_at,
                action=row.action,
                description=row.description,
                metadata=row.metadata_json,
            ) for row in timeline_rows
        ]

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
            subscription_timeline=subscription_timeline,
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
            sub.trial_end = today_ist() + timedelta(days=3)

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
        action_filter: str | None = None,
    ) -> AuditLogResponse:
        query = select(AuditLog).order_by(AuditLog.created_at.desc())

        if gym_id:
            query = query.where(AuditLog.target_gym_id == gym_id)
        if action_filter:
            query = query.where(AuditLog.action == action_filter)

        total = (await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )).scalar_one()

        logs = (await self.db.execute(
            query.offset(skip).limit(limit)
        )).scalars().all()

        # Batch load actor/gym names
        actor_ids = {entry.actor_id for entry in logs if entry.actor_id}
        gym_ids = {entry.target_gym_id for entry in logs if entry.target_gym_id}

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
                    id=str(entry.id),
                    actor_id=str(entry.actor_id) if entry.actor_id else None,
                    actor_name=actor_map.get(entry.actor_id),
                    action=entry.action.value,
                    target_gym_id=str(entry.target_gym_id) if entry.target_gym_id else None,
                    target_gym_name=gym_map.get(entry.target_gym_id),
                    description=entry.description,
                    metadata_json=entry.metadata_json,
                    ip_address=entry.ip_address,
                    created_at=entry.created_at,
                )
                for entry in logs
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

    async def _get_monthly_counts(self, model, date_col, since: datetime) -> list[GrowthTrendPoint]:
        """Get monthly counts for any model with a datetime column."""
        dialect = self.db.bind.dialect.name
        if dialect == "postgresql":
            period_expr = func.to_char(date_col, "YYYY-MM")
        else:
            period_expr = func.strftime("%Y-%m", date_col)

        rows = (await self.db.execute(
            select(
                period_expr.label("period"),
                func.count().label("cnt"),
            ).where(date_col >= since)
            .group_by(period_expr)
            .order_by(period_expr)
        )).all()
        return [GrowthTrendPoint(period=str(r[0]), count=r[1]) for r in rows]

    async def _get_monthly_revenue_trend(self, since: datetime) -> list[GrowthTrendPoint]:
        """Monthly revenue across all gyms."""
        dialect = self.db.bind.dialect.name
        if dialect == "postgresql":
            period_expr = func.to_char(Payment.payment_date, "YYYY-MM")
        else:
            period_expr = func.strftime("%Y-%m", Payment.payment_date)

        rows = (await self.db.execute(
            select(
                period_expr.label("period"),
                func.coalesce(func.sum(Payment.amount_in_paise), 0).label("total"),
            ).where(
                Payment.payment_status == PaymentStatus.COMPLETED,
                Payment.payment_date >= since.date(),
            ).group_by(period_expr)
            .order_by(period_expr)
        )).all()
        return [GrowthTrendPoint(period=str(r[0]), count=int(r[1])) for r in rows]

    # === Delete Gym ===

    async def delete_gym(
        self, gym_id: UUID, confirm_name: str, reason: str,
        actor_id: UUID, ip_address: str | None = None,
    ) -> AdminActionResponse:
        """Permanently delete a gym and all associated data. Destructive operation."""
        gym = await self._get_gym(gym_id)

        if gym.name.lower() != confirm_name.lower():
            raise ValidationError("Gym name confirmation does not match. Deletion cancelled.")

        gym_name = gym.name

        # Delete in order: payments, members, attendance, subscriptions, invoices, users, gym
        from app.models.attendance import Attendance
        from app.models.notification import Notification
        from app.models.asset import Asset, MaintenanceRecord

        await self.db.execute(select(func.count()).select_from(MaintenanceRecord).where(MaintenanceRecord.gym_id == gym_id))
        for model in [MaintenanceRecord, Asset, Notification, Attendance, Payment, Invoice, GymSubscription, Member]:
            await self.db.execute(
                model.__table__.delete().where(model.gym_id == gym_id)
            )
        await self.db.execute(
            User.__table__.delete().where(User.gym_id == gym_id)
        )
        await self.db.execute(
            Gym.__table__.delete().where(Gym.id == gym_id)
        )
        await self.db.flush()

        await self._log_action(
            actor_id=actor_id,
            action=AuditAction.GYM_DELETED,
            description=f"Gym '{gym_name}' permanently deleted. Reason: {reason}",
            metadata={"gym_name": gym_name, "reason": reason},
            ip_address=ip_address,
        )

        return AdminActionResponse(
            success=True,
            message=f"Gym '{gym_name}' has been permanently deleted",
            gym_id=str(gym_id),
            action="gym_deleted",
        )

    # === Platform Analytics ===

    async def get_platform_analytics(self) -> PlatformAnalyticsResponse:
        """Global platform analytics for super admin."""
        twelve_months_ago = datetime.now(timezone.utc) - timedelta(days=365)

        # Member growth
        member_growth = await self._get_monthly_counts(
            Member, Member.created_at, twelve_months_ago
        )

        # Gym growth
        gym_growth = await self._get_monthly_counts(
            Gym, Gym.created_at, twelve_months_ago
        )

        # Revenue trend
        revenue_trend = await self._get_monthly_revenue_trend(twelve_months_ago)

        # Payment success rate
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        total_invoices = (await self.db.execute(
            select(func.count()).select_from(Invoice).where(
                Invoice.created_at >= thirty_days_ago,
            )
        )).scalar_one()
        paid_invoices = (await self.db.execute(
            select(func.count()).select_from(Invoice).where(
                Invoice.created_at >= thirty_days_ago,
                Invoice.status == InvoiceStatus.PAID,
            )
        )).scalar_one()
        payment_success_rate = (paid_invoices / total_invoices * 100) if total_invoices > 0 else None

        # Top gyms by revenue
        top_gyms_rows = (await self.db.execute(
            select(
                Gym.id, Gym.name,
                func.coalesce(func.sum(Payment.amount_in_paise), 0).label("revenue"),
            ).join(Payment, Payment.gym_id == Gym.id)
            .where(Payment.payment_status == PaymentStatus.COMPLETED)
            .group_by(Gym.id, Gym.name)
            .order_by(func.sum(Payment.amount_in_paise).desc())
            .limit(10)
        )).all()
        top_gyms = [
            {"id": str(r[0]), "name": r[1], "revenue_in_paise": int(r[2])}
            for r in top_gyms_rows
        ]

        # Inactive gyms (no login / payment in 30 days)
        inactive_threshold = today_ist() - timedelta(days=30)
        inactive_gyms_rows = (await self.db.execute(
            select(Gym.id, Gym.name, Gym.created_at)
            .outerjoin(Payment, and_(
                Payment.gym_id == Gym.id,
                Payment.payment_date >= inactive_threshold,
            ))
            .where(Payment.id.is_(None), Gym.is_active.is_(True))
            .limit(20)
        )).all()
        inactive_gyms = [
            {"id": str(r[0]), "name": r[1], "created_at": str(r[2]) if r[2] else None}
            for r in inactive_gyms_rows
        ]

        # Feature adoption (count gyms using each feature via plan flags)
        feature_adoption = {}
        feature_cols = {
            "qr_attendance": SubscriptionPlan.qr_attendance_enabled,
            "advanced_analytics": SubscriptionPlan.advanced_analytics_enabled,
            "export_reports": SubscriptionPlan.export_reports_enabled,
            "automated_whatsapp": SubscriptionPlan.automated_whatsapp_enabled,
        }
        for feature_name, col in feature_cols.items():
            count = (await self.db.execute(
                select(func.count()).select_from(GymSubscription)
                .join(SubscriptionPlan, GymSubscription.plan_id == SubscriptionPlan.id)
                .where(
                    col.is_(True),
                    GymSubscription.status.in_([BillingStatus.ACTIVE, BillingStatus.TRIAL]),
                )
            )).scalar_one()
            feature_adoption[feature_name] = count

        return PlatformAnalyticsResponse(
            member_growth=member_growth,
            gym_growth=gym_growth,
            revenue_trend=revenue_trend,
            payment_success_rate=payment_success_rate,
            top_gyms=top_gyms,
            inactive_gyms=inactive_gyms,
            feature_adoption=feature_adoption,
        )

    # === Platform Health ===

    async def get_platform_health(self) -> PlatformHealthResponse:
        """Operational health dashboard for super admin."""
        now = datetime.now(timezone.utc)
        twenty_four_h = now - timedelta(hours=24)
        seven_days = now - timedelta(days=7)

        # Failed payments
        failed_24h = (await self.db.execute(
            select(func.count()).select_from(Invoice).where(
                Invoice.status == InvoiceStatus.FAILED,
                Invoice.created_at >= twenty_four_h,
            )
        )).scalar_one()

        failed_7d = (await self.db.execute(
            select(func.count()).select_from(Invoice).where(
                Invoice.status == InvoiceStatus.FAILED,
                Invoice.created_at >= seven_days,
            )
        )).scalar_one()

        # Inactive gyms (no activity in 30 days)
        inactive_threshold = today_ist() - timedelta(days=30)
        inactive_30d = (await self.db.execute(
            select(func.count()).select_from(Gym)
            .outerjoin(Payment, and_(
                Payment.gym_id == Gym.id,
                Payment.payment_date >= inactive_threshold,
            ))
            .where(Payment.id.is_(None), Gym.is_active == True)  # noqa: E712
        )).scalar_one()

        # Build alerts
        alerts: list[HealthAlert] = []

        if failed_24h > 0:
            alerts.append(HealthAlert(
                level="critical" if failed_24h > 5 else "warning",
                title="Failed Payments",
                description=f"{failed_24h} payment(s) failed in the last 24 hours",
                count=failed_24h,
            ))

        if inactive_30d > 5:
            alerts.append(HealthAlert(
                level="warning",
                title="Inactive Gyms",
                description=f"{inactive_30d} gyms have had no activity in 30 days",
                count=inactive_30d,
            ))

        # Expired subscriptions needing attention
        expired_subs = (await self.db.execute(
            select(func.count()).select_from(GymSubscription).where(
                GymSubscription.status == BillingStatus.EXPIRED,
            )
        )).scalar_one()
        if expired_subs > 0:
            alerts.append(HealthAlert(
                level="info",
                title="Expired Subscriptions",
                description=f"{expired_subs} gym(s) with expired subscriptions",
                count=expired_subs,
            ))

        # Determine overall status
        status = "healthy"
        if any(a.level == "critical" for a in alerts):
            status = "critical"
        elif any(a.level == "warning" for a in alerts):
            status = "degraded"

        return PlatformHealthResponse(
            status=status,
            failed_payments_24h=failed_24h,
            failed_payments_7d=failed_7d,
            inactive_gyms_30d=inactive_30d,
            alerts=alerts,
        )

    # === Platform Settings ===

    async def get_platform_settings(self) -> PlatformSettingsResponse:
        """Get platform-wide settings."""
        settings_row = (await self.db.execute(
            select(PlatformSettings).limit(1)
        )).scalar_one_or_none()

        if not settings_row:
            return PlatformSettingsResponse(
                default_trial_days=3,
                grace_period_days=7,
                max_payment_retries=3,
                maintenance_mode=False,
                maintenance_message=None,
                announcement_active=False,
                announcement_message=None,
                announcement_type="info",
                max_gyms=10000,
                feature_flags=None,
            )

        return PlatformSettingsResponse(
            default_trial_days=settings_row.default_trial_days,
            grace_period_days=settings_row.grace_period_days,
            max_payment_retries=settings_row.max_payment_retries,
            maintenance_mode=settings_row.maintenance_mode,
            maintenance_message=settings_row.maintenance_message,
            announcement_active=settings_row.announcement_active,
            announcement_message=settings_row.announcement_message,
            announcement_type=settings_row.announcement_type,
            max_gyms=settings_row.max_gyms,
            feature_flags=settings_row.feature_flags,
        )

    async def update_platform_settings(
        self, data: UpdatePlatformSettingsRequest,
        actor_id: UUID, ip_address: str | None = None,
    ) -> PlatformSettingsResponse:
        """Update platform settings."""
        settings_row = (await self.db.execute(
            select(PlatformSettings).limit(1)
        )).scalar_one_or_none()

        if not settings_row:
            raise NotFoundError("Platform settings not found. Run migrations.")

        update_data = data.model_dump(exclude_unset=True)
        changes = {}
        for field, value in update_data.items():
            old_value = getattr(settings_row, field, None)
            if old_value != value:
                changes[field] = {"old": str(old_value), "new": str(value)}
                setattr(settings_row, field, value)

        if changes:
            await self.db.flush()

            # Determine which audit action
            action = AuditAction.SETTINGS_UPDATED
            if "maintenance_mode" in changes:
                action = AuditAction.MAINTENANCE_MODE_TOGGLED
            elif "announcement_active" in changes or "announcement_message" in changes:
                action = AuditAction.ANNOUNCEMENT_UPDATED

            await self._log_action(
                actor_id=actor_id,
                action=action,
                description=f"Platform settings updated: {list(changes.keys())}",
                metadata=changes,
                ip_address=ip_address,
            )

        return await self.get_platform_settings()
