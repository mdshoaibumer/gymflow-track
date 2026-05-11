"""
Audit log model for tracking admin actions on the SaaS platform.

Records all super admin operations: trial extensions, suspensions,
plan changes, impersonation events, and billing overrides.
Append-only — no updates or deletes.
"""

import uuid
from enum import Enum as PyEnum

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, PgEnum


class AuditAction(str, PyEnum):
    TRIAL_EXTENDED = "trial_extended"
    GYM_SUSPENDED = "gym_suspended"
    GYM_UNSUSPENDED = "gym_unsuspended"
    GYM_LOCKED = "gym_locked"
    GYM_UNLOCKED = "gym_unlocked"
    PLAN_CHANGED = "plan_changed"
    SUBSCRIPTION_ACTIVATED = "subscription_activated"
    SUBSCRIPTION_CANCELLED = "subscription_cancelled"
    IMPERSONATION_START = "impersonation_start"
    IMPERSONATION_END = "impersonation_end"
    BILLING_OVERRIDE = "billing_override"
    PAYMENT_MARKED_RECEIVED = "payment_marked_received"
    SUPER_ADMIN_CREATED = "super_admin_created"
    GYM_DELETED = "gym_deleted"
    SETTINGS_UPDATED = "settings_updated"
    ANNOUNCEMENT_UPDATED = "announcement_updated"
    MAINTENANCE_MODE_TOGGLED = "maintenance_mode_toggled"


class AuditLog(BaseModel):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_actor", "actor_id"),
        Index("ix_audit_logs_target_gym", "target_gym_id"),
        Index("ix_audit_logs_action", "action"),
        Index("ix_audit_logs_created", "created_at"),
    )

    actor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    action: Mapped[AuditAction] = mapped_column(
        PgEnum(AuditAction, name="auditaction"), nullable=False,
    )
    target_gym_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="SET NULL"),
        nullable=True,
    )
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
