"""
Attendance model for QR check-in / manual attendance tracking.

Indexing Strategy:
- ix_attendance_gym_date: Primary operational query — "who checked in today?"
  Uses (gym_id, check_in_at DESC) for fast date-range scans per tenant.
- ix_attendance_member_date: Member history query — "show this member's attendance"
  Uses (member_id, check_in_at DESC) for efficient per-member lookups.
- ix_attendance_dedup: Prevents double check-in on the same calendar day.
  Partial unique index on (gym_id, member_id, check_in_date) WHERE status != 'cancelled'.

Time-series Query Reasoning:
- Attendance is write-heavy (hundreds of check-ins daily per gym) but reads
  are primarily "today" focused (reception dashboard) or bounded by date range.
- DESC ordering on check_in_at means "most recent" queries hit the index first.
- Separate check_in_date column (Date type) enables simple daily dedup without
  timezone math in queries.

SaaS Operational Implications:
- gym_id on every row + indexes = tenant isolation without row-level security.
- source_type tracks HOW the check-in happened (QR vs manual) for audit trail.
- recorded_by tracks WHO performed the action (staff ID for manual overrides).
"""

import uuid
from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, PgEnum


class AttendanceStatus(str, PyEnum):
    CHECKED_IN = "checked_in"
    CHECKED_OUT = "checked_out"
    CANCELLED = "cancelled"  # Staff-cancelled erroneous check-ins


class CheckInSource(str, PyEnum):
    QR = "qr"
    MANUAL = "manual"
    WHATSAPP_QR = "whatsapp_qr"


class Attendance(BaseModel):
    __tablename__ = "attendance"
    __table_args__ = (
        # Dedup: one active check-in per member per calendar day per gym.
        # Enforced via partial unique index in migration 011 (excludes cancelled rows).
        # Operational query: "today's attendance for this gym"
        Index(
            "ix_attendance_gym_date",
            "gym_id", "check_in_at",
            postgresql_using="btree",
        ),
        # Member history: "this member's attendance history"
        Index(
            "ix_attendance_member_date",
            "member_id", "check_in_at",
            postgresql_using="btree",
        ),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )

    # Timestamps
    check_in_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    check_out_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Denormalized date for simple daily dedup (avoids timezone math in constraints)
    check_in_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Status tracking
    status: Mapped[AttendanceStatus] = mapped_column(
        PgEnum(AttendanceStatus, name="attendancestatus"),
        default=AttendanceStatus.CHECKED_IN,
        nullable=False,
    )

    # Audit fields
    source: Mapped[CheckInSource] = mapped_column(
        PgEnum(CheckInSource, name="checkinsource"), nullable=False
    )
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    member = relationship("Member", lazy="raise")
    gym = relationship("Gym", lazy="raise")
