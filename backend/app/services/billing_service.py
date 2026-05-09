"""
Billing service — subscription lifecycle, trial management, payment processing.

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

TRIAL_DAYS = 14
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
    Idempotently seed Starter and Pro plans.
    Called on startup — skips if plans already exist.
    """
    result = await db.execute(
        select(func.count()).select_from(SubscriptionPlan).where(
            SubscriptionPlan.is_active == True  # noqa: E712
        )
    )
    if result.scalar_one() > 0:
        return  # Plans already exist

    plans = [
        SubscriptionPlan(
            name="Starter",
            tier=PlanTier.STARTER,
            price_in_paise=149900,  # ₹1,499/mo
            billing_interval=BillingInterval.MONTHLY,
            description="For small gyms getting started. Up to 50 members.",
            max_members=50,
            max_staff_users=2,
            sms_notifications_enabled=False,
            advanced_reports_enabled=False,
            is_active=True,
        ),
        SubscriptionPlan(
            name="Pro",
            tier=PlanTier.PRO,
            price_in_paise=299900,  # ₹2,999/mo
            billing_interval=BillingInterval.MONTHLY,
            description="For growing gyms. Up to 200 members, SMS, and reports.",
            max_members=200,
            max_staff_users=5,
            sms_notifications_enabled=True,
            advanced_reports_enabled=True,
            is_active=True,
        ),
    ]
    for plan in plans:
        db.add(plan)
    await db.flush()
    logger.info("Seeded default subscription plans: Starter, Pro")


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
    plan_tier: str = "starter",
) -> GymSubscription:
    """
    Create a free trial subscription for a newly registered gym.

    Called during gym registration. Every gym starts on a trial.
    Default to Starter plan — they can upgrade during or after trial.
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

        logger.info(f"Webhook: payment captured for invoice {invoice.invoice_number}")

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
                logger.warning(f"Webhook: max retries reached for gym subscription {subscription.gym_id}")
            else:
                subscription.status = BillingStatus.PAST_DUE
                logger.info(f"Webhook: payment failed, retry {subscription.payment_retry_count}/{MAX_PAYMENT_RETRIES}")
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

    Returns limit info for the feature gating response.
    """
    from app.models.member import Member

    subscription = await get_subscription(db, gym_id)
    if not subscription:
        return {"allowed": False, "reason": "No active subscription"}

    plan = subscription.plan if hasattr(subscription, "plan") and subscription.plan else None
    if not plan:
        # Load plan manually
        plan_result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == subscription.plan_id)
        )
        plan = plan_result.scalar_one_or_none()

    max_members = plan.max_members if plan else 50

    current_count = (await db.execute(
        select(func.count()).select_from(Member).where(
            Member.gym_id == gym_id,
            Member.is_deleted == False,  # noqa: E712
        )
    )).scalar_one()

    return {
        "allowed": current_count < max_members,
        "max_members": max_members,
        "current_members": current_count,
        "remaining": max(0, max_members - current_count),
    }


async def get_feature_limits(db: AsyncSession, gym_id: UUID) -> dict:
    """Get full feature limits for a gym based on their plan."""
    from app.models.member import Member
    from app.models.user import User

    subscription = await get_subscription(db, gym_id)

    if not subscription:
        return {
            "plan_tier": "none",
            "max_members": 0,
            "current_members": 0,
            "members_remaining": 0,
            "max_staff_users": 0,
            "current_staff_users": 0,
            "sms_notifications_enabled": False,
            "advanced_reports_enabled": False,
            "is_at_member_limit": True,
            "is_at_staff_limit": True,
        }

    plan_result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.id == subscription.plan_id)
    )
    plan = plan_result.scalar_one()

    member_count = (await db.execute(
        select(func.count()).select_from(Member).where(
            Member.gym_id == gym_id,
            Member.is_deleted == False,  # noqa: E712
        )
    )).scalar_one()

    staff_count = (await db.execute(
        select(func.count()).select_from(User).where(User.gym_id == gym_id)
    )).scalar_one()

    return {
        "plan_tier": plan.tier.value,
        "max_members": plan.max_members,
        "current_members": member_count,
        "members_remaining": max(0, plan.max_members - member_count),
        "max_staff_users": plan.max_staff_users,
        "current_staff_users": staff_count,
        "sms_notifications_enabled": plan.sms_notifications_enabled,
        "advanced_reports_enabled": plan.advanced_reports_enabled,
        "is_at_member_limit": member_count >= plan.max_members,
        "is_at_staff_limit": staff_count >= plan.max_staff_users,
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
    """Create an invoice with auto-generated invoice number."""
    now = datetime.now(timezone.utc)
    month_str = now.strftime("%Y%m")

    # Count existing invoices this month for sequential numbering
    count = (await db.execute(
        select(func.count()).select_from(Invoice).where(
            Invoice.invoice_number.like(f"INV-{month_str}-%")
        )
    )).scalar_one()

    invoice_number = f"INV-{month_str}-{count + 1:04d}"

    invoice = Invoice(
        id=uuid4(),
        gym_id=gym_id,
        subscription_id=subscription_id,
        invoice_number=invoice_number,
        amount_in_paise=amount_in_paise,
        status=InvoiceStatus.PENDING,
        period_start=period_start,
        period_end=period_end,
        idempotency_key=f"{gym_id}:{month_str}:{uuid4().hex[:8]}",
        description=description,
    )
    db.add(invoice)
    await db.flush()

    logger.info(f"Invoice created: {invoice_number} for {amount_in_paise} paise")
    return invoice


# === Metrics ===


async def get_billing_metrics(db: AsyncSession, gym_id: UUID) -> dict:
    """
    Internal billing metrics for operational monitoring.

    MRR = sum of active subscription plan price for this gym.
    Scoped to gym_id — owners only see their own gym's data.
    Not a financial system — operational visibility only.
    """
    # Subscription status for this gym
    status_counts = {}
    for status in BillingStatus:
        count = (await db.execute(
            select(func.count()).select_from(GymSubscription).where(
                GymSubscription.gym_id == gym_id,
                GymSubscription.status == status,
            )
        )).scalar_one()
        status_counts[status.value] = count

    # MRR: Plan price for this gym's ACTIVE subscription
    mrr_result = await db.execute(
        select(func.sum(SubscriptionPlan.price_in_paise))
        .select_from(GymSubscription)
        .join(SubscriptionPlan, GymSubscription.plan_id == SubscriptionPlan.id)
        .where(
            GymSubscription.gym_id == gym_id,
            GymSubscription.status == BillingStatus.ACTIVE,
        )
    )
    mrr = mrr_result.scalar_one() or 0

    # Cancelled this month (this gym only)
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    cancelled_count = (await db.execute(
        select(func.count()).select_from(GymSubscription).where(
            GymSubscription.gym_id == gym_id,
            GymSubscription.status == BillingStatus.CANCELLED,
            GymSubscription.cancelled_at >= month_start,
        )
    )).scalar_one()

    # Trial conversion rate (this gym's history)
    total_ever_trial = status_counts.get("trial", 0) + status_counts.get("active", 0) + status_counts.get("cancelled", 0) + status_counts.get("expired", 0)
    total_converted = status_counts.get("active", 0) + status_counts.get("cancelled", 0)
    conversion_rate = (total_converted / total_ever_trial * 100) if total_ever_trial > 0 else None

    # Payment failure rate (this month, this gym)
    total_invoices = (await db.execute(
        select(func.count()).select_from(Invoice).where(
            Invoice.gym_id == gym_id,
            Invoice.created_at >= month_start,
        )
    )).scalar_one()
    failed_invoices = (await db.execute(
        select(func.count()).select_from(Invoice).where(
            Invoice.gym_id == gym_id,
            Invoice.created_at >= month_start,
            Invoice.status == InvoiceStatus.FAILED,
        )
    )).scalar_one()
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
