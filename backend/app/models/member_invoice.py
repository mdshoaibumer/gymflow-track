"""Member Invoice model — payment receipts for gym members."""

import uuid
from datetime import date

from sqlalchemy import String, ForeignKey, Date, Integer, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, PgEnum
from app.models.payment import PaymentMethod


class MemberInvoice(BaseModel):
    __tablename__ = "member_invoices"
    __table_args__ = (
        Index("ix_member_invoices_gym", "gym_id"),
        Index("ix_member_invoices_member", "gym_id", "member_id"),
        Index("ix_member_invoices_number", "gym_id", "invoice_number", unique=True),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payments.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="RESTRICT"), nullable=False
    )

    # Unique invoice number per gym: e.g. INV-2026-0001
    invoice_number: Mapped[str] = mapped_column(String(50), nullable=False)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Snapshot fields (preserved even if gym/member data changes later)
    gym_name: Mapped[str] = mapped_column(String(200), nullable=False)
    gym_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    gym_phone: Mapped[str | None] = mapped_column(String(15), nullable=True)
    gym_logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    member_name: Mapped[str] = mapped_column(String(200), nullable=False)
    member_phone: Mapped[str] = mapped_column(String(15), nullable=False)

    amount_in_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        PgEnum(PaymentMethod, name="paymentmethod"),
        nullable=False,
    )
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    plan_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    gym = relationship("Gym", lazy="raise")
    payment = relationship("Payment", lazy="raise")
    member = relationship("Member", lazy="raise")
