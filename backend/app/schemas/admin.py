"""
Admin dashboard request/response schemas.
Used by super admin routes for gym management, subscription control, analytics,
platform health monitoring, impersonation, and platform settings.
"""

from datetime import date, datetime

from pydantic import BaseModel, Field


# === SaaS Metrics ===


class PlanDistributionItem(BaseModel):
    tier: str
    name: str
    count: int


class GrowthTrendPoint(BaseModel):
    period: str
    count: int


class SaaSMetricsResponse(BaseModel):
    total_gyms: int
    active_subscriptions: int
    trial_gyms: int
    suspended_gyms: int
    locked_gyms: int
    total_members: int
    mrr_in_paise: int
    arr_in_paise: int
    failed_payments: int
    plan_distribution: list[PlanDistributionItem] = []
    gym_growth_trend: list[GrowthTrendPoint] = []
    revenue_trend: list[GrowthTrendPoint] = []


# === Gym Directory ===


class GymOwnerInfo(BaseModel):
    id: str
    name: str
    email: str
    phone: str


class GymDirectoryItem(BaseModel):
    id: str
    name: str
    slug: str
    email: str | None
    city: str | None
    is_active: bool
    created_at: datetime | None
    owner: GymOwnerInfo | None
    subscription_status: str | None
    plan_name: str | None
    plan_tier: str | None
    trial_end: date | None
    current_period_end: date | None
    member_count: int
    active_staff: int = 0
    revenue_in_paise: int
    last_payment_date: date | None


class GymDirectoryResponse(BaseModel):
    gyms: list[GymDirectoryItem]
    total: int


# === Gym Details ===


class StaffInfo(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    role: str
    is_active: bool


class InvoiceInfo(BaseModel):
    id: str
    invoice_number: str
    amount_in_paise: int
    status: str
    period_start: date
    period_end: date
    paid_at: datetime | None


class SubscriptionTimelineEntry(BaseModel):
    date: datetime | None
    action: str
    description: str
    metadata: dict | None = None


class GymDetailResponse(BaseModel):
    id: str
    name: str
    slug: str
    phone: str
    email: str | None
    address: str | None
    city: str | None
    is_active: bool
    created_at: datetime | None

    # Owner
    owner: GymOwnerInfo | None

    # Subscription
    subscription_status: str | None
    plan_name: str | None
    plan_tier: str | None
    trial_start: date | None
    trial_end: date | None
    current_period_start: date | None
    current_period_end: date | None
    cancel_at_period_end: bool = False
    days_remaining: int | None = None

    # Counts
    member_count: int
    active_member_count: int
    staff_count: int
    total_revenue_in_paise: int

    # Staff list
    staff: list[StaffInfo]

    # Invoices
    invoices: list[InvoiceInfo]

    # Subscription timeline
    subscription_timeline: list[SubscriptionTimelineEntry] = []


# === Admin Actions ===


class ExtendTrialRequest(BaseModel):
    days: int = Field(..., ge=1, le=90, description="Number of days to extend trial")
    reason: str = Field(..., min_length=3, max_length=500)


class ChangePlanRequest(BaseModel):
    plan_tier: str = Field(..., description="Plan tier: 'starter', 'pro', or 'elite'")
    reason: str = Field(..., min_length=3, max_length=500)


class SuspendGymRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class UnsuspendGymRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class LockGymRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class UnlockGymRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
    new_status: str = Field("active", description="Status to set after unlock: 'active' or 'trial'")


class DeleteGymRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
    confirm_name: str = Field(..., min_length=1, description="Type the gym name to confirm deletion")


class MarkPaymentReceivedRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
    amount_in_paise: int = Field(..., gt=0)


class AdminActionResponse(BaseModel):
    success: bool
    message: str
    gym_id: str
    action: str


# === Impersonation ===


class ImpersonationResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    gym_id: str
    gym_name: str
    owner_id: str
    owner_name: str
    owner_email: str
    impersonator_id: str


# === Platform Analytics ===


class PlatformAnalyticsResponse(BaseModel):
    member_growth: list[GrowthTrendPoint] = []
    gym_growth: list[GrowthTrendPoint] = []
    revenue_trend: list[GrowthTrendPoint] = []
    churn_rate: float | None = None
    payment_success_rate: float | None = None
    top_gyms: list[dict] = []
    inactive_gyms: list[dict] = []
    feature_adoption: dict = {}


# === Platform Health ===


class HealthAlert(BaseModel):
    level: str  # "critical", "warning", "info"
    title: str
    description: str
    count: int = 0
    timestamp: datetime | None = None


class PlatformHealthResponse(BaseModel):
    status: str  # "healthy", "degraded", "critical"
    failed_payments_24h: int
    failed_payments_7d: int
    inactive_gyms_30d: int
    alerts: list[HealthAlert] = []
    login_anomalies: int = 0
    api_error_rate: float | None = None


# === Platform Settings ===


class PlatformSettingsResponse(BaseModel):
    default_trial_days: int
    grace_period_days: int
    max_payment_retries: int
    maintenance_mode: bool
    maintenance_message: str | None
    announcement_active: bool
    announcement_message: str | None
    announcement_type: str
    max_gyms: int
    feature_flags: dict | None


class UpdatePlatformSettingsRequest(BaseModel):
    default_trial_days: int | None = Field(None, ge=1, le=90)
    grace_period_days: int | None = Field(None, ge=1, le=30)
    max_payment_retries: int | None = Field(None, ge=1, le=10)
    maintenance_mode: bool | None = None
    maintenance_message: str | None = None
    announcement_active: bool | None = None
    announcement_message: str | None = None
    announcement_type: str | None = Field(None, pattern="^(info|warning|success)$")
    max_gyms: int | None = Field(None, ge=1)
    feature_flags: dict | None = None


# === Audit Log ===


class AuditLogEntry(BaseModel):
    id: str
    actor_id: str | None
    actor_name: str | None = None
    action: str
    target_gym_id: str | None
    target_gym_name: str | None = None
    description: str
    metadata_json: dict | None
    ip_address: str | None
    created_at: datetime | None


class AuditLogResponse(BaseModel):
    entries: list[AuditLogEntry]
    total: int
