"""
Due Management models — tracks outstanding balances when members
make partial payments against their membership plans.

Core concepts:
- MemberDue: One record per billing cycle that tracks plan price,
  discount, effective amount, and remaining balance.
- DuePayment: Links individual payments to a due record (many-to-one).
  Supports multiple partial payments against a single due.

Money is stored in paise (INR × 100) for exact arithmetic.
"""

import uuid
from datetime import date
from enum import Enum as PyEnum

from sqlalchemy import Date, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, PgEnum


class DueStatus(str, PyEnum):
    PENDING = "pending"       # No payment made yet against this due
    PARTIAL = "partial"       # Some payment made, balance remains
    PAID = "paid"             # Fully settled
    WAIVED = "waived"         # Written off by owner


class MemberDue(BaseModel):
    """Tracks outstanding balance for a single billing cycle."""

    __tablename__ = "member_dues"
    __table_args__ = (
        Index("ix_member_dues_gym_status", "gym_id", "status"),
        Index("ix_member_dues_member", "member_id"),
        # Fast query: "show all members with outstanding dues, highest first"
        Index(
            "ix_member_dues_gym_balance",
            "gym_id", "balance_paise",
            postgresql_where="status IN ('pending', 'partial')",
        ),
        # Aging queries: "dues overdue by 30/60/90 days"
        Index(
            "ix_member_dues_gym_due_date",
            "gym_id", "due_date",
            postgresql_where="status IN ('pending', 'partial')",
        ),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # Snapshot of plan details at time of due creation
    plan_name: Mapped[str] = mapped_column(String(100), nullable=False)
    plan_amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_paise: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    effective_amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)

    # Running balance (denormalized for query speed, updated transactionally)
    total_paid_paise: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    balance_paise: Mapped[int] = mapped_column(Integer, nullable=False)

    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[DueStatus] = mapped_column(
        PgEnum(DueStatus, name="duestatus"),
        default=DueStatus.PENDING,
        nullable=False,
    )

    # Waiver tracking
    waive_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    waived_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )

    # Relationships
    member = relationship("Member", lazy="raise")
    gym = relationship("Gym", lazy="raise")
    due_payments = relationship("DuePayment", back_populates="due", lazy="raise")


class DuePayment(BaseModel):
    """Links an individual payment to a due record.

    A single due may have multiple partial payments.
    A single payment could theoretically apply to one due.
    """

    __tablename__ = "due_payments"
    __table_args__ = (
        Index("ix_due_payments_due", "due_id"),
        Index("ix_due_payments_payment", "payment_id"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False,
    )
    due_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("member_dues.id", ondelete="CASCADE"),
        nullable=False,
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payments.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)

    # Relationships
    due = relationship("MemberDue", back_populates="due_payments", lazy="raise")
    payment = relationship("Payment", lazy="raise")
