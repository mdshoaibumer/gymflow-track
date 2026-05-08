from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.notification import NotificationChannel, NotificationStatus, NotificationType


class NotificationResponse(BaseModel):
    id: UUID
    gym_id: UUID
    member_id: UUID
    notification_type: NotificationType
    channel: NotificationChannel
    status: NotificationStatus
    scheduled_for: datetime
    sent_at: datetime | None
    failure_reason: str | None
    retry_count: int
    payload: dict | None

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse]
    total: int


class NotificationStats(BaseModel):
    """Dashboard widget data for notifications."""
    pending_count: int
    sent_today: int
    failed_count: int
    upcoming_count: int


class TriggerScanResponse(BaseModel):
    """Response from manual reminder scan trigger."""
    reminders_scheduled: int
