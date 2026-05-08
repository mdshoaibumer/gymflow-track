"""add notifications table

Revision ID: 003_notifications
Revises: 002_payments
Create Date: 2026-05-08

Adds:
- notifications table for tracking all outbound messages
- Enum types for notification_type, notification_status, notification_channel
- Unique dedup index prevents duplicate scheduling
- Status + scheduled_for index for efficient job processing
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003_notifications"
down_revision = "002_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types
    notificationtype_enum = postgresql.ENUM(
        "expiry_7_days", "expiry_3_days", "membership_expired",
        "payment_overdue", "welcome", "renewal_confirmation",
        name="notificationtype",
        create_type=False,
    )
    notificationstatus_enum = postgresql.ENUM(
        "pending", "sent", "failed", "cancelled",
        name="notificationstatus",
        create_type=False,
    )
    notificationchannel_enum = postgresql.ENUM(
        "whatsapp", "sms",
        name="notificationchannel",
        create_type=False,
    )
    notificationtype_enum.create(op.get_bind(), checkfirst=True)
    notificationstatus_enum.create(op.get_bind(), checkfirst=True)
    notificationchannel_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "gym_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("gyms.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("members.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("notification_type", notificationtype_enum, nullable=False),
        sa.Column(
            "channel", notificationchannel_enum, nullable=False, server_default="whatsapp"
        ),
        sa.Column("status", notificationstatus_enum, nullable=False, server_default="pending"),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # Composite indexes
    op.create_index("ix_notifications_gym_status", "notifications", ["gym_id", "status"])
    op.create_index(
        "ix_notifications_dedup",
        "notifications",
        ["gym_id", "member_id", "notification_type", "scheduled_for"],
        unique=True,
    )
    op.create_index(
        "ix_notifications_pending_schedule",
        "notifications",
        ["status", "scheduled_for"],
    )


def downgrade() -> None:
    op.drop_table("notifications")
    sa.Enum(name="notificationtype").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="notificationstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="notificationchannel").drop(op.get_bind(), checkfirst=True)
