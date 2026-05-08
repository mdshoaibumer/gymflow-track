from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.payment import PaymentMethod, PaymentStatus


class PaymentCreateRequest(BaseModel):
    member_id: UUID
    amount_in_paise: int = Field(..., gt=0, description="Amount in paise (₹1 = 100)")
    payment_method: PaymentMethod
    payment_status: PaymentStatus | None = None  # defaults to COMPLETED
    payment_date: date | None = None  # defaults to today
    notes: str | None = Field(None, max_length=500)

    # Optional: auto-renew membership on payment
    membership_start: date | None = None
    membership_end: date | None = None
    membership_plan: str | None = None


class PaymentResponse(BaseModel):
    id: UUID
    gym_id: UUID
    member_id: UUID
    amount_in_paise: int
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    payment_date: date
    notes: str | None
    created_by: UUID | None

    model_config = {"from_attributes": True}


class PaymentListResponse(BaseModel):
    payments: list[PaymentResponse]
    total: int
