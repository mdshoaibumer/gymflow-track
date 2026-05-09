"""add attendance table

Revision ID: 004_attendance
Revises: 003_notifications
Create Date: 2026-05-08

Adds:
- attendance table for QR + manual check-in tracking
- Enum types: attendance_status, check_in_source
- Unique constraint prevents double check-in per day
- Composite indexes for gym-date and member-date queries
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "004_attendance"
down_revision = "003_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types using the safe, idempotent pattern
    # ENUM(..., create_type=False) + .create(checkfirst=True) ensures
    # the migration is re-runnable without "type already exists" errors
    attendance_status = postgresql.ENUM(
        "checked_in", "checked_out", "cancelled",
        name="attendancestatus",
        create_type=False,
    )
    check_in_source = postgresql.ENUM(
        "qr", "manual",
        name="checkinsource",
        create_type=False,
    )
    attendance_status.create(op.get_bind(), checkfirst=True)
    check_in_source.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "attendance",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gyms.id"), nullable=False),
        sa.Column("member_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("members.id"), nullable=False),
        sa.Column("check_in_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("check_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("check_in_date", sa.Date(), nullable=False),
        sa.Column("status", attendance_status, nullable=False, server_default="checked_in"),
        sa.Column("source", check_in_source, nullable=False),
        sa.Column("recorded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        # Unique constraint: one check-in per member per day per gym
        sa.UniqueConstraint("gym_id", "member_id", "check_in_date", name="uq_attendance_gym_member_date"),
    )

    # Indexes for fast operational queries
    op.create_index("ix_attendance_gym_date", "attendance", ["gym_id", "check_in_at"])
    op.create_index("ix_attendance_member_date", "attendance", ["member_id", "check_in_at"])


def downgrade() -> None:
    op.drop_index("ix_attendance_member_date", table_name="attendance")
    op.drop_index("ix_attendance_gym_date", table_name="attendance")
    op.drop_table("attendance")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS attendancestatus")
    op.execute("DROP TYPE IF EXISTS checkinsource")
