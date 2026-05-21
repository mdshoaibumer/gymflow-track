"""
Gym-level audit log for tracking payment voids, membership overrides,
and other sensitive operations performed by admins/owners.

Append-only — no updates or deletes.
Provides full audit trail for financial compliance.
"""

import uuid
from enum import Enum as PyEnum

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, PgEnum


class GymAuditAction(str, PyEnum):
    PAYMENT_VOIDED = "payment_voided"
    PAYMENT_EDITED = "payment_edited"
    MEMBERSHIP_OVERRIDE = "membership_override"
    MEMBER_FINANCIAL_RECOMPUTE = "member_financial_recompute"


class GymAuditLog(BaseModel):
    """Append-only audit trail for gym-level admin operations."""

    __tablename__ = "gym_audit_logs"
    __table_args__ = (
        Index("ix_gym_audit_logs_gym", "gym_id"),
        Index("ix_gym_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_gym_audit_logs_action", "action"),
        Index("ix_gym_audit_logs_performed_by", "performed_by"),
        Index("ix_gym_audit_logs_created", "created_at"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False,
    )
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    action: Mapped[GymAuditAction] = mapped_column(
        PgEnum(GymAuditAction, name="gymauditaction"), nullable=False,
    )
    old_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    performed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )
