"""
Billing API router — subscription management, payments, webhooks.

Endpoints:
- GET  /billing/plans           — Public pricing page data
- GET  /billing/subscription    — Current subscription status
- POST /billing/subscribe       — Start/upgrade subscription (creates payment order)
- POST /billing/verify          — Verify payment after Razorpay checkout
- POST /billing/webhook         — Razorpay webhook receiver
- POST /billing/cancel          — Cancel subscription (at period end)
- GET  /billing/history         — Invoice/billing history
- GET  /billing/features        — Feature limits for current plan
- GET  /billing/metrics         — Internal billing metrics (owner only)

Security:
- All endpoints except /plans and /webhook require JWT auth
- /webhook validates Razorpay signature (no JWT — Razorpay calls this)
- /subscribe and /cancel are owner-only (billing is a business decision)
- /metrics is owner-only (operational visibility)
"""

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_owner
from app.schemas.billing import (
    BillingHistoryResponse,
    BillingMetricsResponse,
    CancelRequest,
    CancelResponse,
    FeatureLimitsResponse,
    InvoiceResponse,
    PaymentVerifyRequest,
    PaymentVerifyResponse,
    PlanResponse,
    SubscribeRequest,
    SubscribeResponse,
    SubscriptionResponse,
    WebhookResponse,
)
from app.services import billing_service
from app.services.payment_gateway import get_payment_provider

logger = logging.getLogger("gymflow.billing")

router = APIRouter()


# === Plans (Public) ===


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(db: AsyncSession = Depends(get_db)):
    """
    Get available subscription plans.

    Public endpoint — no auth required.
    Used by the pricing page and upgrade prompts.
    """
    plans = await billing_service.get_active_plans(db)
    return [
        PlanResponse(
            id=str(p.id),
            name=p.name,
            tier=p.tier.value,
            price_in_paise=p.price_in_paise,
            billing_interval=p.billing_interval.value,
            description=p.description,
            max_members=p.max_members,
            max_staff_users=p.max_staff_users,
            sms_notifications_enabled=p.sms_notifications_enabled,
            advanced_reports_enabled=p.advanced_reports_enabled,
        )
        for p in plans
    ]


# === Subscription Status ===


@router.get("/subscription", response_model=SubscriptionResponse | None)
async def get_subscription(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get current subscription for the gym.

    Returns null if no subscription exists (shouldn't happen — trial is auto-created).
    Includes computed fields: days_remaining, is_trial.
    """
    from datetime import date

    sub = await billing_service.get_subscription(db, current_user.gym_id)
    if not sub:
        return None

    # Compute days remaining
    days_remaining = None
    today = date.today()
    if sub.trial_end and sub.status.value == "trial":
        days_remaining = max(0, (sub.trial_end - today).days)
    elif sub.current_period_end:
        days_remaining = max(0, (sub.current_period_end - today).days)

    return SubscriptionResponse(
        id=str(sub.id),
        plan=PlanResponse(
            id=str(sub.plan.id),
            name=sub.plan.name,
            tier=sub.plan.tier.value,
            price_in_paise=sub.plan.price_in_paise,
            billing_interval=sub.plan.billing_interval.value,
            description=sub.plan.description,
            max_members=sub.plan.max_members,
            max_staff_users=sub.plan.max_staff_users,
            sms_notifications_enabled=sub.plan.sms_notifications_enabled,
            advanced_reports_enabled=sub.plan.advanced_reports_enabled,
        ),
        status=sub.status.value,
        trial_start=sub.trial_start,
        trial_end=sub.trial_end,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        cancel_at_period_end=sub.cancel_at_period_end,
        days_remaining=days_remaining,
        is_trial=sub.status.value == "trial",
    )


# === Subscribe / Upgrade ===


@router.post("/subscribe", response_model=SubscribeResponse)
async def subscribe(
    data: SubscribeRequest,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """
    Start or upgrade a subscription. Creates a payment order.

    Flow:
    1. Creates/updates subscription + pending invoice
    2. Creates Razorpay order
    3. Returns order details for frontend checkout widget

    Frontend then opens Razorpay Checkout and sends result to /billing/verify.
    """
    subscription, invoice = await billing_service.start_subscription(
        db, current_user.gym_id, data.plan_tier
    )
    return SubscribeResponse(
        subscription_id=str(subscription.id),
        razorpay_order_id=invoice.razorpay_order_id,
        razorpay_key_id=get_payment_provider().key_id if hasattr(get_payment_provider(), "key_id") else None,
        amount_in_paise=invoice.amount_in_paise,
        status=subscription.status.value,
    )


# === Payment Verification ===


@router.post("/verify", response_model=PaymentVerifyResponse)
async def verify_payment(
    data: PaymentVerifyRequest,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """
    Verify Razorpay payment after checkout.

    Called by frontend after the Razorpay checkout widget closes.
    Verifies the payment signature and activates the subscription.

    Idempotent: safe to call multiple times with the same data.
    """
    try:
        subscription = await billing_service.verify_and_activate(
            db,
            gym_id=current_user.gym_id,
            payment_id=data.razorpay_payment_id,
            order_id=data.razorpay_order_id,
            signature=data.razorpay_signature,
        )
        return PaymentVerifyResponse(
            verified=True,
            subscription_status=subscription.status.value,
            message="Payment verified. Your subscription is now active!",
        )
    except Exception as e:
        logger.error(f"Payment verification failed: {e}")
        return PaymentVerifyResponse(
            verified=False,
            subscription_status="unknown",
            message=str(e),
        )


# === Webhook ===


@router.post("/webhook", response_model=WebhookResponse)
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Razorpay webhook receiver.

    Security:
    - Validates webhook signature before processing
    - No JWT auth (Razorpay calls this, not our users)
    - Idempotent: duplicate webhooks are safely ignored

    Razorpay sends events like:
    - payment.captured (payment successful)
    - payment.failed (payment failed)
    - subscription.charged (recurring payment)
    """
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    provider = get_payment_provider()

    # Verify webhook is genuinely from Razorpay
    if not provider.verify_webhook_signature(body, signature):
        logger.warning("Webhook signature verification FAILED — rejecting")
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={"status": "invalid_signature"})

    import json
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        logger.warning("Webhook: invalid JSON body")
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={"status": "invalid_body"})

    event = provider.parse_webhook(payload)
    logger.info(f"Webhook received: {event.event_type}")

    # Process payment events
    if event.event_type in ("payment.captured", "payment.failed"):
        status = "captured" if event.event_type == "payment.captured" else "failed"
        await billing_service.process_webhook_payment(
            db,
            payment_id=event.payment_id or "",
            order_id=event.order_id or "",
            amount_in_paise=event.amount_in_paise,
            status=status,
        )

    return WebhookResponse(status="ok")


# === Cancellation ===


@router.post("/cancel", response_model=CancelResponse)
async def cancel_subscription(
    data: CancelRequest,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel subscription. Access continues until current period ends.

    Not immediate: the gym owner has already paid for the current period.
    This is a trust-building decision, not a technical one.
    """
    subscription = await billing_service.cancel_subscription(
        db, current_user.gym_id, data.reason
    )
    return CancelResponse(
        status="cancelled",
        access_until=subscription.current_period_end or subscription.trial_end,
        message="Your subscription has been cancelled. You'll have access until the end of your current billing period.",
    )


# === Billing History ===


@router.get("/history", response_model=BillingHistoryResponse)
async def billing_history(
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get invoice history for the gym."""
    invoices = await billing_service.get_billing_history(db, current_user.gym_id)
    return BillingHistoryResponse(
        invoices=[
            InvoiceResponse(
                id=str(inv.id),
                invoice_number=inv.invoice_number,
                amount_in_paise=inv.amount_in_paise,
                status=inv.status.value,
                period_start=inv.period_start,
                period_end=inv.period_end,
                paid_at=inv.paid_at,
                description=inv.description,
                created_at=inv.created_at,
            )
            for inv in invoices
        ],
        total=len(invoices),
    )


# === Feature Limits ===


@router.get("/features", response_model=FeatureLimitsResponse)
async def feature_limits(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get feature limits for the gym's current plan.

    Used by frontend to:
    - Show "X of Y members used" indicators
    - Disable "Add Member" when at limit
    - Show upgrade prompts
    """
    limits = await billing_service.get_feature_limits(db, current_user.gym_id)
    return FeatureLimitsResponse(**limits)


# === Billing Metrics (Internal) ===


@router.get("/metrics", response_model=BillingMetricsResponse)
async def billing_metrics(
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """
    Internal billing metrics for operational monitoring.

    Owner-only. Shows MRR, subscription counts, conversion rates.
    Lightweight — not a financial reporting system.
    """
    metrics = await billing_service.get_billing_metrics(db)
    return BillingMetricsResponse(**metrics)
