"""
Admin dashboard request/response schemas.
Used by super admin routes for gym management, subscription control, and analytics.
"""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


# === SaaS Metrics ===


class PlanDistributionItem(BaseModel):
    tier: str
    name: str
    count: int


class SaaSMetricsResponse(BaseModel):
    total_gyms: int
    active_subscriptions: int
    trial_gyms: int
    suspended_gyms: int
    total_members: int
    mrr_in_paise: int
    failed_payments: int
    plan_distribution: list[PlanDistributionItem] = []


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


# === Admin Actions ===


class ExtendTrialRequest(BaseModel):
    days: int = Field(..., ge=1, le=90, description="Number of days to extend trial")
    reason: str = Field(..., min_length=3, max_length=500)


class ChangePlanRequest(BaseModel):
    plan_tier: str = Field(..., description="Plan tier: 'starter' or 'pro'")
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


class AdminActionResponse(BaseModel):
    success: bool
    message: str
    gym_id: str
    action: str


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
