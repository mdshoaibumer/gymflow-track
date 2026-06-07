"""Pydantic schemas for Due Management endpoints."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.due import DueStatus
from app.models.payment import PaymentMethod


# --- Request Schemas ---


class DuePaymentRequest(BaseModel):
    """Record a partial or full payment against an outstanding due."""
    amount_in_paise: int = Field(..., gt=0, description="Amount in paise (₹1 = 100)")
    payment_method: PaymentMethod
    payment_date: date | None = None  # defaults to today
    notes: str | None = Field(None, max_length=500)
    idempotency_key: str | None = Field(None, max_length=64)


class DueWaiveRequest(BaseModel):
    """Waive (write off) an outstanding due."""
    reason: str = Field(..., min_length=5, max_length=500, description="Reason for waiving")


# --- Response Schemas ---


class DuePaymentLinkResponse(BaseModel):
    """A single payment linked to a due."""
    id: UUID
    payment_id: UUID
    amount_paise: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DueMemberBrief(BaseModel):
    """Minimal member info for due listings."""
    id: UUID
    name: str
    phone: str
    photo_url: str | None = None

    model_config = {"from_attributes": True}


class DueResponse(BaseModel):
    """Single due record."""
    id: UUID
    gym_id: UUID
    member_id: UUID
    plan_name: str
    plan_amount_paise: int
    discount_paise: int
    effective_amount_paise: int
    total_paid_paise: int
    balance_paise: int
    due_date: date
    status: DueStatus
    waive_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    member: DueMemberBrief | None = None

    model_config = {"from_attributes": True}


class DueDetailResponse(DueResponse):
    """Due with linked payments."""
    payments: list[DuePaymentLinkResponse] = []


class DueListResponse(BaseModel):
    """Paginated list of dues."""
    items: list[DueResponse]
    total: int
    total_outstanding_paise: int = 0


class AgingBucket(BaseModel):
    """One bucket in the aging report."""
    range: str
    count: int
    total_paise: int


class AgingReportResponse(BaseModel):
    """Aging report with bucketed outstanding dues."""
    buckets: list[AgingBucket]
    total_outstanding_paise: int


class DueSummaryResponse(BaseModel):
    """Dashboard summary widget for dues."""
    total_members_with_dues: int
    total_outstanding_paise: int
    collected_this_month_paise: int
