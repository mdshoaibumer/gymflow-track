import uuid
from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import String, ForeignKey, Date, Integer, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, PgEnum


class PaymentMethod(str, PyEnum):
    CASH = "cash"
    UPI = "upi"
    CARD = "card"
    BANK_TRANSFER = "bank_transfer"
    OTHER = "other"


class PaymentStatus(str, PyEnum):
    COMPLETED = "completed"
    PENDING = "pending"
    FAILED = "failed"
    REFUNDED = "refunded"


class Payment(BaseModel):
    __tablename__ = "payments"
    __table_args__ = (
        # Revenue queries: SELECT SUM(amount) WHERE gym_id = ? AND payment_date BETWEEN ...
        Index("ix_payments_gym_date", "gym_id", "payment_date"),
        # Member payment history: WHERE gym_id = ? AND member_id = ?
        Index("ix_payments_gym_member", "gym_id", "member_id"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount_in_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        PgEnum(PaymentMethod, name="paymentmethod"), nullable=False
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        PgEnum(PaymentStatus, name="paymentstatus"),
        default=PaymentStatus.COMPLETED,
        nullable=False,
    )
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Who recorded this payment (user_id from JWT)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    gym = relationship("Gym", lazy="raise")
    member = relationship("Member", lazy="raise")
