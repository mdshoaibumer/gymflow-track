from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.payment import PaymentMethod, PaymentStatus


class PaymentCreateRequest(BaseModel):
    member_id: UUID
    amount_in_paise: int = Field(..., gt=0, description="Amount in paise (₹1 = 100)")
    payment_method: PaymentMethod
    payment_status: PaymentStatus | None = None  # defaults to COMPLETED
    payment_date: date | None = None  # defaults to today
    notes: str | None = Field(None, max_length=500)
    # Client-supplied idempotency key to prevent duplicate submissions.
    # If provided, a second request with the same key+gym returns the
    # existing payment instead of creating a duplicate.
    idempotency_key: str | None = Field(None, max_length=64)

    # Optional: auto-renew membership on payment
    membership_start: date | None = None
    membership_end: date | None = None
    membership_plan: str | None = None


class VoidPaymentRequest(BaseModel):
    """Request body for voiding a payment."""
    reason: str = Field(..., min_length=5, max_length=500, description="Reason for voiding this payment")


class PaymentResponse(BaseModel):
    id: UUID
    gym_id: UUID
    member_id: UUID
    amount_in_paise: int
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    payment_date: date
    notes: str | None
    idempotency_key: str | None = None
    created_by: UUID | None
    member_name: str | None = None
    voided_at: datetime | None = None
    voided_by: UUID | None = None
    void_reason: str | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def extract_member_name(cls, data):
        """Pull member.name from the ORM relationship when available.

        Uses inspect() to check if the 'member' relationship is loaded,
        avoiding lazy='raise' errors when the relationship wasn't
        eagerly loaded (e.g. after create without selectinload).
        """
        from sqlalchemy import inspect as sa_inspect

        member = None
        try:
            state = sa_inspect(data)
            if "member" in state.dict:
                member = data.member
        except Exception:
            pass

        if member is not None:
            data = dict(
                id=data.id,
                gym_id=data.gym_id,
                member_id=data.member_id,
                amount_in_paise=data.amount_in_paise,
                payment_method=data.payment_method,
                payment_status=data.payment_status,
                payment_date=data.payment_date,
                notes=data.notes,
                idempotency_key=data.idempotency_key,
                created_by=data.created_by,
                member_name=member.name,
                voided_at=data.voided_at,
                voided_by=data.voided_by,
                void_reason=data.void_reason,
            )
        return data


class PaymentListResponse(BaseModel):
    payments: list[PaymentResponse]
    total: int
