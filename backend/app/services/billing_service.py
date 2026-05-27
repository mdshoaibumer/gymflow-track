"""
Billing Service — Subscription Lifecycle & Payment Processing.

Author      : Mohammed Shoaib U
Module      : app.services.billing_service

SaaS Retention Reasoning:
─────────────────────────
Small gym owners are busy. They forget to pay, not because they don't value
the product, but because they're training clients at 6am. Our billing must:

1. Be forgiving: Grace periods > aggressive lockouts
2. Be transparent: Always tell them what's happening and when
3. Be recoverable: Failed payment ≠ instant cancellation
4. Preserve data: Never delete their members/attendance even if they churn

Churn Reduction Strategy:
- Trial → gentle nudge emails (Day 10, Day 13)
- Payment failed → retry 3x over 7 days with WhatsApp reminders
- Past due → read-only mode (they can SEE data, can't ADD new)
- Expired → 30 days before data archival (they can still reactivate)
- Cancellation → access until period end + win-back email after 7 days

Grace Period Design:
- PAST_DUE: 7 days of full access while retrying payment
- After PAST_DUE → EXPIRED: 7 days of read-only access
- After read-only grace → locked (show "reactivate" screen)
- Data is NEVER deleted. Only access is restricted.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4
from app.core.timezone import today_ist

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationError
from app.middleware.subscription_enforcement import invalidate_subscription_cache
from app.models.subscription import (
    BillingInterval,
    BillingStatus,
    GymSubscription,
    Invoice,
    InvoiceStatus,
    PlanTier,
    SubscriptionPlan,
)
from app.services.payment_gateway import get_payment_provider

logger = logging.getLogger("gymflow.billing")

# === Constants ===

TRIAL_DAYS = 3650  # ~10 years — effectively unlimited
GRACE_PERIOD_DAYS = 7
MAX_PAYMENT_RETRIES = 3
RETRY_INTERVAL_DAYS = 2  # Retry every 2 days (3 retries = 6 days within 7-day grace)


# === Plan Operations ===


async def get_active_plans(db: AsyncSession) -> list[SubscriptionPlan]:
    """Get all active subscription plans (for pricing page)."""
    result = await db.execute(
        select(SubscriptionPlan)
        .where(SubscriptionPlan.is_active == True)  # noqa: E712
        .order_by(SubscriptionPlan.price_in_paise)
    )
    return list(result.scalars().all())


async def get_plan_by_tier(db: AsyncSession, tier: str) -> SubscriptionPlan:
    """Get a specific plan by tier name."""
    result = await db.execute(
        select(SubscriptionPlan).where(
            SubscriptionPlan.tier == PlanTier(tier),
            SubscriptionPlan.is_active == True,  # noqa: E712
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise NotFoundError(f"Plan '{tier}' not found or inactive")
    return plan


# === Plan Seeding ===


async def seed_default_plans(db: AsyncSession) -> None:
    """
    Idempotently seed and update Starter, Pro, and Elite plans.
    Called on startup — creates missing plans and updates existing plans
    so feature flags stay correct (e.g. Pro gets qr_attendance_enabled=True).
    Also deactivates stale Enterprise plans from older migrations.
    """
    plan_definitions = [
        {
            "tier": PlanTier.STARTER,
            "name": "Starter",
            "price_in_paise": 99900,
            "yearly_price_in_paise": 999900,
            "description": "For small gyms getting started. Up to 100 active members.",
            "max_members": 100,
            "max_staff_users": 2,
            "sms_notifications_enabled": True,
            "advanced_reports_enabled": False,
            "qr_attendance_enabled": False,
            "advanced_analytics_enabled": False,
            "export_reports_enabled": False,
            "multi_branch_enabled": False,
            "automated_whatsapp_enabled": False,
        },
        {
            "tier": PlanTier.PRO,
            "name": "Pro",
            "price_in_paise": 199900,
            "yearly_price_in_paise": 1999900,
            "description": "For growing gyms. Up to 500 members, QR attendance, analytics, and exports.",
            "max_members": 500,
            "max_staff_users": 5,
            "sms_notifications_enabled": True,
            "advanced_reports_enabled": True,
            "qr_attendance_enabled": True,
            "advanced_analytics_enabled": True,
            "export_reports_enabled": True,
            "multi_branch_enabled": False,
            "automated_whatsapp_enabled": False,
        },
        {
            "tier": PlanTier.ELITE,
            "name": "Elite",
            "price_in_paise": 299900,
            "yearly_price_in_paise": 2999900,
            "description": "Unlimited members, all features, multi-branch, automated WhatsApp, dedicated support.",
            "max_members": 999999,
            "max_staff_users": 999999,
            "sms_notifications_enabled": True,
            "advanced_reports_enabled": True,
            "qr_attendance_enabled": True,
            "advanced_analytics_enabled": True,
            "export_reports_enabled": True,
            "multi_branch_enabled": True,
            "automated_whatsapp_enabled": True,
        },
    ]

    # Fields to keep in sync on existing plans (feature flags + limits)
    sync_fields = [
        "name", "price_in_paise", "yearly_price_in_paise", "description",
        "max_members", "max_staff_users",
        "sms_notifications_enabled", "advanced_reports_enabled",
        "qr_attendance_enabled", "advanced_analytics_enabled",
        "export_reports_enabled", "multi_branch_enabled",
        "automated_whatsapp_enabled",
    ]

    seeded = []
    updated = []
    for defn in plan_definitions:
        result = await db.execute(
            select(SubscriptionPlan).where(
                SubscriptionPlan.tier == defn["tier"],
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing plan to ensure feature flags are correct
            changed = False
            for field in sync_fields:
                if field in defn and getattr(existing, field) != defn[field]:
                    setattr(existing, field, defn[field])
                    changed = True
            if not existing.is_active:
                existing.is_active = True
                changed = True
            if changed:
                updated.append(defn["name"])
        else:
            # Create new plan
            plan = SubscriptionPlan(
                billing_interval=BillingInterval.MONTHLY,
                is_active=True,
                **defn,
            )
            db.add(plan)
            seeded.append(defn["name"])

    # Deactivate stale Enterprise plans from migration 007
    stale = await db.execute(
        select(SubscriptionPlan).where(
            SubscriptionPlan.name == "Enterprise",
            SubscriptionPlan.is_active == True,  # noqa: E712
        )
    )
    for plan in stale.scalars().all():
        plan.is_active = False
        logger.info(f"Deactivated stale Enterprise plan {plan.id}")

    if seeded or updated:
        await db.flush()
    
    if seeded:
        logger.info(f"Seeded subscription plans: {', '.join(seeded)}")
    if updated:
        logger.info(f"Updated subscription plans: {', '.join(updated)}")


# === Subscription Operations ===


async def get_subscription(db: AsyncSession, gym_id: UUID) -> GymSubscription | None:
    """Get the current subscription for a gym (with plan loaded)."""
    result = await db.execute(
        select(GymSubscription)
        .options(selectinload(GymSubscription.plan))
        .where(GymSubscription.gym_id == gym_id)
    )
    return result.scalar_one_or_none()


async def create_trial_subscription(
    db: AsyncSession,
    gym_id: UUID,
    plan_tier: str = "elite",
) -> GymSubscription:
    """
    Create a free trial subscription for a newly registered gym.

    Called during gym registration. Every gym starts on Elite plan
    with unlimited access — no restrictions, no locking.
    """
    plan = await get_plan_by_tier(db, plan_tier)
    today = today_ist()

    # Check if gym already has a subscription
    existing = await get_subscription(db, gym_id)
    if existing:
        logger.warning(f"Gym {gym_id} already has a subscription, skipping trial creation")
        return existing

    subscription = GymSubscription(
        id=uuid4(),
        gym_id=gym_id,
        plan_id=plan.id,
        status=BillingStatus.TRIAL,
        trial_start=today,
        trial_end=today + timedelta(days=TRIAL_DAYS),
    )
    db.add(subscription)
    await db.flush()

    logger.info(f"Trial created for gym {gym_id}: {plan.name} plan, expires {subscription.trial_end}")
    return subscription


async def start_subscription(
    db: AsyncSession,
    gym_id: UUID,
    plan_tier: str,
) -> tuple[GymSubscription, Invoice]:
    """
    Start or upgrade a paid subscription.

    Flow:
    1. Find or create subscription row
    2. Create a pending invoice
    3. Create a payment order via provider
    4. Return subscription + invoice (frontend uses order_id for checkout)

    After payment, verify_and_activate() completes the flow.
    """
    plan = await get_plan_by_tier(db, plan_tier)
    today = today_ist()
    period_end = _next_period_end(today, BillingInterval.MONTHLY)

    subscription = await get_subscription(db, gym_id)

    if subscription:
        # Upgrade existing subscription
        subscription.plan_id = plan.id
        # Don't change status yet — wait for payment verification
    else:
        # New subscription
        subscription = GymSubscription(
            id=uuid4(),
            gym_id=gym_id,
            plan_id=plan.id,
            status=BillingStatus.TRIAL,  # Will become ACTIVE after payment
        )
        db.add(subscription)
        await db.flush()

    # Create invoice
    invoice = await _create_invoice(
        db,
        gym_id=gym_id,
        subscription_id=subscription.id,
        amount_in_paise=plan.price_in_paise,
        period_start=today,
        period_end=period_end,
        description=f"{plan.name} plan — {today.strftime('%b %Y')}",
    )

    # Create payment order
    provider = get_payment_provider()
    order = await provider.create_order(
        amount_in_paise=plan.price_in_paise,
        currency="INR",
        receipt=invoice.invoice_number,
        notes={"gym_id": str(gym_id), "invoice_id": str(invoice.id)},
    )

    invoice.razorpay_order_id = order.order_id
    await db.flush()

    logger.info(f"Subscription order created: gym={gym_id}, plan={plan_tier}, order={order.order_id}")
    return subscription, invoice


async def verify_and_activate(
    db: AsyncSession,
    gym_id: UUID,
    payment_id: str,
    order_id: str,
    signature: str,
) -> GymSubscription:
    """
    Verify payment and activate subscription.

    Called after the frontend Razorpay checkout completes.
    This is the critical path — must be idempotent.
    """
    # Find the invoice by order_id
    result = await db.execute(
        select(Invoice).where(
            Invoice.gym_id == gym_id,
            Invoice.razorpay_order_id == order_id,
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError("Invoice not found for this order")

    # Idempotency: if already paid, return current state
    if invoice.status == InvoiceStatus.PAID:
        logger.info(f"Invoice {invoice.invoice_number} already paid, skipping")
        sub = await get_subscription(db, gym_id)
        if not sub:
            raise NotFoundError("Subscription not found")
        return sub

    # Verify payment signature
    provider = get_payment_provider()
    verification = await provider.verify_payment(payment_id, order_id, signature)

    if not verification.verified:
        invoice.status = InvoiceStatus.FAILED
        await db.flush()
        logger.warning(
            "Payment signature verification failed: gym=%s order=%s payment=%s",
            gym_id, order_id, payment_id,
        )
        raise ValidationError("Payment verification failed — signature mismatch")

    # Mark invoice as paid
    invoice.status = InvoiceStatus.PAID
    invoice.razorpay_payment_id = payment_id
    invoice.razorpay_signature = signature
    invoice.paid_at = datetime.now(timezone.utc)

    # Activate subscription
    subscription = await get_subscription(db, gym_id)
    if not subscription:
        raise NotFoundError("Subscription not found")

    subscription.status = BillingStatus.ACTIVE
    subscription.current_period_start = invoice.period_start
    subscription.current_period_end = invoice.period_end
    subscription.payment_retry_count = 0
    subscription.cancel_at_period_end = False

    await db.flush()
    invalidate_subscription_cache(gym_id)
    logger.info(
        f"Subscription activated: gym={gym_id}, "
        f"plan={subscription.plan_id}, until={subscription.current_period_end}"
    )
    return subscription


async def cancel_subscription(
    db: AsyncSession,
    gym_id: UUID,
    reason: str | None = None,
) -> GymSubscription:
    """
    Cancel a subscription. Access continues until current period ends.

    Why not immediate cancellation:
    - They've already paid for this period
    - Abrupt cutoff damages trust
    - Period-end cancellation reduces support tickets
    - Gives us a window for win-back messaging
    """
    subscription = await get_subscription(db, gym_id)
    if not subscription:
        raise NotFoundError("No active subscription found")

    if subscription.status == BillingStatus.EXPIRED:
        raise ValidationError("Subscription is already expired")

    if subscription.status == BillingStatus.CANCELLED:
        raise ValidationError("Subscription is already cancelled")

    subscription.status = BillingStatus.CANCELLED
    subscription.cancelled_at = datetime.now(timezone.utc)
    subscription.cancel_at_period_end = True

    if reason:
        logger.info(f"Subscription cancelled: gym={gym_id}, reason={reason}")
    else:
        logger.info(f"Subscription cancelled: gym={gym_id}")

    await db.flush()
    invalidate_subscription_cache(gym_id)
    return subscription


# === Webhook Processing ===


async def process_webhook_payment(
    db: AsyncSession,
    payment_id: str,
    order_id: str,
    amount_in_paise: int | None,
    status: str,
) -> None:
    """
    Process a payment webhook event.

    Idempotency: Checks invoice status before processing.
    If already PAID, the webhook is safely ignored.

    This handles both:
    - payment.captured (successful payment)
    - payment.failed (failed payment)
    """
    # Find the invoice
    result = await db.execute(
        select(Invoice).where(Invoice.razorpay_order_id == order_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        logger.warning(f"Webhook: no invoice found for order {order_id}")
        return

    # Idempotency check
    if invoice.status == InvoiceStatus.PAID:
        logger.info(f"Webhook: invoice {invoice.invoice_number} already paid, ignoring duplicate")
        return

    if status == "captured":
        invoice.status = InvoiceStatus.PAID
        invoice.razorpay_payment_id = payment_id
        invoice.paid_at = datetime.now(timezone.utc)

        # Activate subscription
        sub_result = await db.execute(
            select(GymSubscription).where(GymSubscription.id == invoice.subscription_id)
        )
        subscription = sub_result.scalar_one_or_none()
        if subscription:
            subscription.status = BillingStatus.ACTIVE
            subscription.current_period_start = invoice.period_start
            subscription.current_period_end = invoice.period_end
            subscription.payment_retry_count = 0
            invalidate_subscription_cache(invoice.gym_id)

        logger.info(
            "Webhook: payment captured for invoice %s (gym=%s, payment=%s)",
            invoice.invoice_number, invoice.gym_id, payment_id,
        )

    elif status == "failed":
        invoice.status = InvoiceStatus.FAILED

        sub_result = await db.execute(
            select(GymSubscription).where(GymSubscription.id == invoice.subscription_id)
        )
        subscription = sub_result.scalar_one_or_none()
        if subscription:
            subscription.payment_retry_count += 1
            subscription.last_payment_attempt = datetime.now(timezone.utc)

            if subscription.payment_retry_count >= MAX_PAYMENT_RETRIES:
                subscription.status = BillingStatus.EXPIRED
                logger.warning(
                    "Webhook: max retries reached for gym %s — subscription expired "
                    "(invoice=%s, payment=%s)",
                    subscription.gym_id, invoice.invoice_number, payment_id,
                )
            else:
                subscription.status = BillingStatus.PAST_DUE
                logger.info(
                    "Webhook: payment failed for gym %s — retry %d/%d "
                    "(invoice=%s, payment=%s)",
                    subscription.gym_id, subscription.payment_retry_count,
                    MAX_PAYMENT_RETRIES, invoice.invoice_number, payment_id,
                )
            invalidate_subscription_cache(invoice.gym_id)

    await db.flush()


# === Trial & Expiration ===


async def check_trial_expirations(db: AsyncSession) -> int:
    """
    Background job: expire trial subscriptions that have passed their end date.

    Called by scheduler. Returns count of expired trials.
    """
    today = today_ist()
    result = await db.execute(
        select(GymSubscription).where(
            GymSubscription.status == BillingStatus.TRIAL,
            GymSubscription.trial_end < today,
        )
    )
    expired = list(result.scalars().all())

    for sub in expired:
        sub.status = BillingStatus.EXPIRED
        invalidate_subscription_cache(sub.gym_id)
        logger.info(f"Trial expired: gym={sub.gym_id}")

    if expired:
        await db.flush()
    return len(expired)


async def check_subscription_expirations(db: AsyncSession) -> int:
    """
    Background job: expire/cancel subscriptions past their period end.

    - CANCELLED + past period end → EXPIRED
    - ACTIVE + past period end (should have renewed) → PAST_DUE
    """
    today = today_ist()
    count = 0

    # Cancelled subscriptions past their period
    result = await db.execute(
        select(GymSubscription).where(
            GymSubscription.status == BillingStatus.CANCELLED,
            GymSubscription.cancel_at_period_end == True,  # noqa: E712
            GymSubscription.current_period_end < today,
        )
    )
    for sub in result.scalars().all():
        sub.status = BillingStatus.EXPIRED
        invalidate_subscription_cache(sub.gym_id)
        logger.info(f"Cancelled subscription expired: gym={sub.gym_id}")
        count += 1

    if count:
        await db.flush()
    return count


# === Access Control ===


def get_access_level(subscription: GymSubscription | None) -> str:
    """
    Determine access level based on subscription status.

    Returns:
    - "full": All features available
    - "read_only": Can view data but not modify (grace period)
    - "locked": Must reactivate to access anything

    Why read-only instead of hard lockout:
    - A gym owner who can't see their member list WILL churn permanently
    - Read-only lets them see the value they'd lose, motivating payment
    - Operational data (attendance history) has inherent value even without writes
    - Trust: "We're holding your data safe" vs "Pay or lose everything"
    """
    if subscription is None:
        return "locked"

    if subscription.status in (BillingStatus.TRIAL, BillingStatus.ACTIVE):
        return "full"

    if subscription.status == BillingStatus.PAST_DUE:
        return "full"  # Still retrying — don't punish yet

    if subscription.status == BillingStatus.CANCELLED:
        # Still in paid period?
        if subscription.current_period_end and subscription.current_period_end >= today_ist():
            return "full"
        # Grace period after cancellation
        if subscription.current_period_end:
            grace_end = subscription.current_period_end + timedelta(days=GRACE_PERIOD_DAYS)
            if today_ist() <= grace_end:
                return "read_only"
        return "locked"

    if subscription.status == BillingStatus.EXPIRED:
        # Grace period after expiration
        if subscription.current_period_end:
            grace_end = subscription.current_period_end + timedelta(days=GRACE_PERIOD_DAYS)
            if today_ist() <= grace_end:
                return "read_only"
        if subscription.trial_end:
            grace_end = subscription.trial_end + timedelta(days=GRACE_PERIOD_DAYS)
            if today_ist() <= grace_end:
                return "read_only"
        return "locked"

    return "locked"


# === Feature Gating ===


async def check_member_limit(db: AsyncSession, gym_id: UUID) -> dict:
    """
    Check if gym has reached its member limit.

    Only ACTIVE members count toward the limit.
    Inactive/frozen/deleted/expired members don't count.
    """
    from app.models.member import Member, MembershipStatus

    subscription = await get_subscription(db, gym_id)
    if not subscription:
        return {"allowed": False, "reason": "No active subscription", "max_members": 0, "current_members": 0, "remaining": 0}

    plan = subscription.plan if hasattr(subscription, "plan") and subscription.plan else None
    if not plan:
        plan_result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == subscription.plan_id)
        )
        plan = plan_result.scalar_one_or_none()

    max_members = plan.max_members if plan else 100
    is_unlimited = max_members >= 999999

    current_count = (await db.execute(
        select(func.count()).select_from(Member).where(
            Member.gym_id == gym_id,
            Member.is_deleted == False,  # noqa: E712
            Member.membership_status == MembershipStatus.ACTIVE,
        )
    )).scalar_one()

    return {
        "allowed": is_unlimited or current_count < max_members,
        "max_members": max_members,
        "current_members": current_count,
        "remaining": 999999 if is_unlimited else max(0, max_members - current_count),
        "is_unlimited": is_unlimited,
    }


async def check_staff_limit(db: AsyncSession, gym_id: UUID) -> dict:
    """
    Check if gym has reached its staff account limit.

    Counts all active users (including the owner).
    """
    from app.models.user import User

    subscription = await get_subscription(db, gym_id)
    if not subscription:
        return {"allowed": False, "reason": "No active subscription", "max_staff": 0, "current_staff": 0, "remaining": 0}

    plan = subscription.plan if hasattr(subscription, "plan") and subscription.plan else None
    if not plan:
        plan_result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == subscription.plan_id)
        )
        plan = plan_result.scalar_one_or_none()

    max_staff = plan.max_staff_users if plan else 2
    is_unlimited = max_staff >= 999999

    current_count = (await db.execute(
        select(func.count()).select_from(User).where(
            User.gym_id == gym_id,
            User.is_active == True,  # noqa: E712
        )
    )).scalar_one()

    return {
        "allowed": is_unlimited or current_count < max_staff,
        "max_staff": max_staff,
        "current_staff": current_count,
        "remaining": 999999 if is_unlimited else max(0, max_staff - current_count),
        "is_unlimited": is_unlimited,
    }


async def check_feature_access(db: AsyncSession, gym_id: UUID, feature: str) -> dict:
    """
    Check if a specific feature is available on the gym's current plan.

    Features: qr_attendance, advanced_analytics, export_reports,
              multi_branch, automated_whatsapp, advanced_reports

    Returns dict with 'allowed' boolean and plan info for upgrade prompts.

    NOTE: During early access, all features return allowed=True.
    """
    subscription = await get_subscription(db, gym_id)
    if not subscription:
        # Early access: all features available even without subscription
        return {"allowed": True, "plan_tier": "starter", "required_plan": "starter"}

    plan_result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.id == subscription.plan_id)
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        return {"allowed": False, "plan_tier": "none", "required_plan": "starter"}

    feature_map = {
        "qr_attendance": (plan.qr_attendance_enabled, "pro"),
        "advanced_analytics": (plan.advanced_analytics_enabled, "pro"),
        "export_reports": (plan.export_reports_enabled, "pro"),
        "multi_branch": (plan.multi_branch_enabled, "elite"),
        "automated_whatsapp": (plan.automated_whatsapp_enabled, "elite"),
        "advanced_reports": (plan.advanced_reports_enabled, "pro"),
        "sms_notifications": (plan.sms_notifications_enabled, "starter"),
    }

    enabled, required_plan = feature_map.get(feature, (False, "elite"))

    return {
        "allowed": enabled,
        "plan_tier": plan.tier.value,
        "required_plan": required_plan,
    }


async def get_feature_limits(db: AsyncSession, gym_id: UUID) -> dict:
    """Get full feature limits for a gym based on their plan."""
    from app.models.member import Member, MembershipStatus
    from app.models.user import User

    subscription = await get_subscription(db, gym_id)

    if not subscription:
        # Early access: all features unlocked even without a subscription
        return {
            "plan_tier": "starter",
            "plan_name": "Early Access (All Features)",
            "max_members": 999999,
            "current_members": 0,
            "members_remaining": 999999,
            "max_staff_users": 999999,
            "current_staff_users": 0,
            "sms_notifications_enabled": True,
            "advanced_reports_enabled": True,
            "qr_attendance_enabled": True,
            "advanced_analytics_enabled": True,
            "export_reports_enabled": True,
            "multi_branch_enabled": True,
            "automated_whatsapp_enabled": True,
            "is_at_member_limit": False,
            "is_at_staff_limit": False,
            "member_usage_percent": 0,
            "staff_usage_percent": 0,
            "is_unlimited_members": True,
            "is_unlimited_staff": True,
            "subscription_status": "trial",
            "days_remaining": 30,
            "current_period_end": None,
            "yearly_price_in_paise": 0,
        }

    plan_result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.id == subscription.plan_id)
    )
    plan = plan_result.scalar_one()

    # Only count ACTIVE members toward limit
    member_count = (await db.execute(
        select(func.count()).select_from(Member).where(
            Member.gym_id == gym_id,
            Member.is_deleted == False,  # noqa: E712
            Member.membership_status == MembershipStatus.ACTIVE,
        )
    )).scalar_one()

    staff_count = (await db.execute(
        select(func.count()).select_from(User).where(
            User.gym_id == gym_id,
            User.is_active == True,  # noqa: E712
        )
    )).scalar_one()

    is_unlimited_members = plan.max_members >= 999999
    is_unlimited_staff = plan.max_staff_users >= 999999

    member_usage_pct = 0 if is_unlimited_members else min(100, round(member_count / max(plan.max_members, 1) * 100))
    staff_usage_pct = 0 if is_unlimited_staff else min(100, round(staff_count / max(plan.max_staff_users, 1) * 100))

    # Compute days remaining
    days_remaining = None
    today = today_ist()
    if subscription.trial_end and subscription.status == BillingStatus.TRIAL:
        days_remaining = max(0, (subscription.trial_end - today).days)
    elif subscription.current_period_end:
        days_remaining = max(0, (subscription.current_period_end - today).days)

    period_end = None
    if subscription.current_period_end:
        period_end = subscription.current_period_end.isoformat()
    elif subscription.trial_end:
        period_end = subscription.trial_end.isoformat()

    return {
        "plan_tier": plan.tier.value,
        "plan_name": plan.name,
        "max_members": plan.max_members,
        "current_members": member_count,
        "members_remaining": 999999 if is_unlimited_members else max(0, plan.max_members - member_count),
        "max_staff_users": plan.max_staff_users,
        "current_staff_users": staff_count,
        "sms_notifications_enabled": plan.sms_notifications_enabled,
        "advanced_reports_enabled": plan.advanced_reports_enabled,
        "qr_attendance_enabled": plan.qr_attendance_enabled,
        "advanced_analytics_enabled": plan.advanced_analytics_enabled,
        "export_reports_enabled": plan.export_reports_enabled,
        "multi_branch_enabled": plan.multi_branch_enabled,
        "automated_whatsapp_enabled": plan.automated_whatsapp_enabled,
        "is_at_member_limit": not is_unlimited_members and member_count >= plan.max_members,
        "is_at_staff_limit": not is_unlimited_staff and staff_count >= plan.max_staff_users,
        "member_usage_percent": member_usage_pct,
        "staff_usage_percent": staff_usage_pct,
        "is_unlimited_members": is_unlimited_members,
        "is_unlimited_staff": is_unlimited_staff,
        "subscription_status": subscription.status.value,
        "days_remaining": days_remaining,
        "current_period_end": period_end,
        "yearly_price_in_paise": plan.yearly_price_in_paise,
    }


# === Invoicing ===


async def get_billing_history(
    db: AsyncSession, gym_id: UUID, skip: int = 0, limit: int = 50
) -> list[Invoice]:
    """Get invoices for a gym with pagination, newest first."""
    result = await db.execute(
        select(Invoice)
        .where(Invoice.gym_id == gym_id)
        .order_by(Invoice.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


async def count_billing_history(db: AsyncSession, gym_id: UUID) -> int:
    """Count total invoices for a gym (for pagination metadata)."""
    result = await db.execute(
        select(func.count()).select_from(Invoice).where(Invoice.gym_id == gym_id)
    )
    return result.scalar_one()


async def _create_invoice(
    db: AsyncSession,
    gym_id: UUID,
    subscription_id: UUID,
    amount_in_paise: int,
    period_start: date,
    period_end: date,
    description: str,
) -> Invoice:
    """Create an invoice with a concurrency-safe invoice number.

    Uses a UUID suffix for guaranteed uniqueness without table locking or
    race conditions during concurrent requests.
    """
    now = datetime.now(timezone.utc)
    month_str = now.strftime("%Y%m")
    invoice_id = uuid4()
    idempotency_key = f"{gym_id}:{month_str}:{invoice_id.hex[:8]}"

    invoice_number = f"INV-{month_str}-{invoice_id.hex[:8].upper()}"

    invoice = Invoice(
        id=invoice_id,
        gym_id=gym_id,
        subscription_id=subscription_id,
        invoice_number=invoice_number,
        amount_in_paise=amount_in_paise,
        status=InvoiceStatus.PENDING,
        period_start=period_start,
        period_end=period_end,
        idempotency_key=idempotency_key,
        description=description,
    )
    db.add(invoice)

    await db.flush()
    logger.info(
        "Invoice created: %s for %d paise (gym=%s)",
        invoice_number, amount_in_paise, gym_id,
    )
    return invoice


# === Metrics ===


async def get_billing_metrics(db: AsyncSession, gym_id: UUID) -> dict:
    """
    Internal billing metrics for operational monitoring.

    Optimized: single subscription lookup + 2 invoice queries instead of N+1
    status queries. A gym has exactly one subscription row.
    """
    # Single query to get this gym's subscription status
    sub = await db.execute(
        select(GymSubscription)
        .options(selectinload(GymSubscription.plan))
        .where(GymSubscription.gym_id == gym_id)
    )
    subscription = sub.scalar_one_or_none()

    status_counts = {s.value: 0 for s in BillingStatus}
    mrr = 0
    if subscription:
        status_counts[subscription.status.value] = 1
        if subscription.status == BillingStatus.ACTIVE and subscription.plan:
            mrr = subscription.plan.price_in_paise

    # Cancelled this month (check single subscription)
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    cancelled_count = 0
    if (
        subscription
        and subscription.status == BillingStatus.CANCELLED
        and subscription.cancelled_at
        and subscription.cancelled_at >= month_start
    ):
        cancelled_count = 1

    # Trial conversion: meaningful only if subscription has progressed past trial
    conversion_rate = None
    if subscription:
        if subscription.status in (BillingStatus.ACTIVE, BillingStatus.CANCELLED, BillingStatus.EXPIRED):
            conversion_rate = 100.0  # converted from trial
        elif subscription.status == BillingStatus.TRIAL:
            conversion_rate = 0.0  # still on trial

    # Invoice failure rate (this month, this gym) — 2 queries consolidated to 1
    invoice_stats = await db.execute(
        select(
            func.count().label("total"),
            func.count().filter(Invoice.status == InvoiceStatus.FAILED).label("failed"),
        ).where(
            Invoice.gym_id == gym_id,
            Invoice.created_at >= month_start,
        )
    )
    row = invoice_stats.one()
    total_invoices = row.total
    failed_invoices = row.failed
    failure_rate = (failed_invoices / total_invoices * 100) if total_invoices > 0 else None

    return {
        "mrr_in_paise": mrr,
        "active_subscriptions": status_counts.get("active", 0),
        "trial_subscriptions": status_counts.get("trial", 0),
        "past_due_subscriptions": status_counts.get("past_due", 0),
        "cancelled_this_month": cancelled_count,
        "trial_conversion_rate": round(conversion_rate, 1) if conversion_rate is not None else None,
        "payment_failure_rate": round(failure_rate, 1) if failure_rate is not None else None,
    }


# === Helpers ===


def _next_period_end(start: date, interval: BillingInterval) -> date:
    """Calculate the end of the billing period."""
    if interval == BillingInterval.MONTHLY:
        # Add ~30 days, handling month boundaries
        month = start.month + 1
        year = start.year
        if month > 12:
            month = 1
            year += 1
        # Handle months with fewer days (e.g., Jan 31 → Feb 28)
        import calendar
        max_day = calendar.monthrange(year, month)[1]
        day = min(start.day, max_day)
        return date(year, month, day)
    return start + timedelta(days=30)
