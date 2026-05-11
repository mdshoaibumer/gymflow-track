"""
Billing + subscription request/response schemas.
"""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


# === Plan Schemas ===


class PlanResponse(BaseModel):
    id: str
    name: str
    tier: str
    price_in_paise: int
    billing_interval: str
    description: str | None
    max_members: int
    max_staff_users: int
    sms_notifications_enabled: bool
    advanced_reports_enabled: bool
    qr_attendance_enabled: bool = False
    advanced_analytics_enabled: bool = False
    export_reports_enabled: bool = False
    multi_branch_enabled: bool = False
    automated_whatsapp_enabled: bool = False
    yearly_price_in_paise: int = 0


# === Subscription Schemas ===


class SubscriptionResponse(BaseModel):
    id: str
    plan: PlanResponse
    status: str
    trial_start: date | None
    trial_end: date | None
    current_period_start: date | None
    current_period_end: date | None
    cancel_at_period_end: bool
    days_remaining: int | None = None
    is_trial: bool = False


class SubscribeRequest(BaseModel):
    plan_tier: str = Field(..., description="Plan tier: 'starter' or 'pro'")


class SubscribeResponse(BaseModel):
    subscription_id: str
    razorpay_order_id: str | None = None
    razorpay_key_id: str | None = None
    amount_in_paise: int
    currency: str = "INR"
    status: str


class CancelRequest(BaseModel):
    reason: str | None = Field(None, max_length=500)


class CancelResponse(BaseModel):
    status: str
    access_until: date | None
    message: str


# === Payment Verification ===


class PaymentVerifyRequest(BaseModel):
    """Razorpay payment verification — sent from frontend after checkout."""
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str


class PaymentVerifyResponse(BaseModel):
    verified: bool
    subscription_status: str
    message: str


# === Webhook ===


class WebhookResponse(BaseModel):
    status: str = "ok"


# === Invoice Schemas ===


class InvoiceResponse(BaseModel):
    id: str
    invoice_number: str
    amount_in_paise: int
    status: str
    period_start: date
    period_end: date
    paid_at: datetime | None
    description: str | None
    created_at: datetime


class BillingHistoryResponse(BaseModel):
    invoices: list[InvoiceResponse]
    total: int


# === Feature Gating ===


class FeatureLimitsResponse(BaseModel):
    """Current feature limits based on the gym's subscription."""
    plan_tier: str
    plan_name: str = ""
    max_members: int
    current_members: int
    members_remaining: int
    max_staff_users: int
    current_staff_users: int
    sms_notifications_enabled: bool
    advanced_reports_enabled: bool
    qr_attendance_enabled: bool = False
    advanced_analytics_enabled: bool = False
    export_reports_enabled: bool = False
    multi_branch_enabled: bool = False
    automated_whatsapp_enabled: bool = False
    is_at_member_limit: bool
    is_at_staff_limit: bool
    member_usage_percent: int = 0
    staff_usage_percent: int = 0
    is_unlimited_members: bool = False
    is_unlimited_staff: bool = False
    subscription_status: str = "none"
    days_remaining: int | None = None
    current_period_end: str | None = None
    yearly_price_in_paise: int = 0


# === Metrics ===


class BillingMetricsResponse(BaseModel):
    mrr_in_paise: int
    active_subscriptions: int
    trial_subscriptions: int
    past_due_subscriptions: int
    cancelled_this_month: int
    trial_conversion_rate: float | None
    payment_failure_rate: float | None
