import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import String, ForeignKey, DateTime, Text, Index, Date
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, PgEnum


class NotificationType(str, PyEnum):
    """Types of notifications the system sends."""
    EXPIRY_7_DAYS = "expiry_7_days"
    EXPIRY_3_DAYS = "expiry_3_days"
    MEMBERSHIP_EXPIRED = "membership_expired"
    PAYMENT_OVERDUE = "payment_overdue"
    WELCOME = "welcome"
    RENEWAL_CONFIRMATION = "renewal_confirmation"


class NotificationStatus(str, PyEnum):
    """Lifecycle states of a notification."""
    PENDING = "pending"       # Scheduled, waiting to be sent
    SENT = "sent"             # Successfully delivered to provider
    FAILED = "failed"         # Provider rejected or errored
    CANCELLED = "cancelled"   # Manually cancelled before sending


class NotificationChannel(str, PyEnum):
    """Delivery channel (extensible for SMS/email later)."""
    WHATSAPP = "whatsapp"
    SMS = "sms"


class Notification(BaseModel):
    __tablename__ = "notifications"
    __table_args__ = (
        # Fast lookup: "pending notifications for this gym to process"
        Index("ix_notifications_gym_status", "gym_id", "status"),
        # Idempotency check: prevent duplicate (gym, member, type, scheduled date)
        Index(
            "ix_notifications_dedup",
            "gym_id", "member_id", "notification_type", "scheduled_for",
            unique=True,
        ),
        # Scheduled job processing: find pending notifications due now
        Index("ix_notifications_pending_schedule", "status", "scheduled_for"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    notification_type: Mapped[NotificationType] = mapped_column(
        PgEnum(NotificationType, name="notificationtype"), nullable=False
    )
    channel: Mapped[NotificationChannel] = mapped_column(
        PgEnum(NotificationChannel, name="notificationchannel"),
        default=NotificationChannel.WHATSAPP,
        nullable=False,
    )
    status: Mapped[NotificationStatus] = mapped_column(
        PgEnum(NotificationStatus, name="notificationstatus"),
        default=NotificationStatus.PENDING,
        nullable=False,
    )

    # When the notification is scheduled to be sent
    scheduled_for: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    # When it was actually sent (null if pending/failed)
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Why it failed (null if not failed)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Number of retry attempts
    retry_count: Mapped[int] = mapped_column(default=0, nullable=False)

    # Flexible payload for template variables (member name, phone, plan, amount, etc.)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    gym = relationship("Gym", lazy="raise")
    member = relationship("Member", lazy="raise")
