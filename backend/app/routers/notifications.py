from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_admin
from app.models.notification import NotificationStatus, NotificationType
from app.repositories.notification_repository import NotificationRepository
from app.schemas.notification import (
    NotificationListResponse,
    NotificationResponse,
    NotificationStats,
    TriggerScanResponse,
)
from app.services.reminder_service import ReminderEngine

router = APIRouter()


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: NotificationStatus | None = Query(None),
    notification_type: NotificationType | None = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List notifications for the current gym.
    Supports filtering by status and type.
    All authenticated roles can view.
    """
    repo = NotificationRepository(db)
    notifications = await repo.list_by_gym(
        current_user.gym_id, skip, limit, status, notification_type
    )
    total = await repo.count_by_gym(
        current_user.gym_id, status, notification_type
    )
    return NotificationListResponse(notifications=notifications, total=total)


@router.get("/stats", response_model=NotificationStats)
async def get_notification_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get notification statistics for the dashboard.
    Pending, sent today, failed, and upcoming counts.
    """
    repo = NotificationRepository(db)
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    pending = await repo.count_by_gym(
        current_user.gym_id, status=NotificationStatus.PENDING
    )
    sent_today = await repo.count_sent_today(current_user.gym_id, today_start)
    failed = await repo.count_failed_unresolved(current_user.gym_id)
    upcoming = await repo.count_upcoming_scheduled(current_user.gym_id, today_start)

    return NotificationStats(
        pending_count=pending,
        sent_today=sent_today,
        failed_count=failed,
        upcoming_count=upcoming,
    )


@router.get("/upcoming", response_model=list[NotificationResponse])
async def get_upcoming_notifications(
    limit: int = Query(20, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get upcoming pending notifications (sorted by schedule time)."""
    repo = NotificationRepository(db)
    return await repo.get_upcoming(current_user.gym_id, limit=limit)


@router.post("/scan", response_model=TriggerScanResponse)
async def trigger_reminder_scan(
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually trigger a reminder scan for the current gym.
    OWNER and ADMIN only. Useful for testing or immediate scheduling.
    Idempotent — won't create duplicate notifications.
    """
    engine = ReminderEngine(db)
    created = await engine.schedule_expiry_reminders(current_user.gym_id)
    created += await engine.schedule_overdue_reminders(current_user.gym_id)
    return TriggerScanResponse(reminders_scheduled=created)


@router.post("/{notification_id}/cancel", response_model=NotificationResponse)
async def cancel_notification(
    notification_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a pending notification. OWNER and ADMIN only."""
    from app.core.exceptions import NotFoundError, ValidationError

    repo = NotificationRepository(db)
    notification = await repo.get_by_id(notification_id, current_user.gym_id)
    if not notification:
        raise NotFoundError("Notification not found")
    if notification.status != NotificationStatus.PENDING:
        raise ValidationError("Can only cancel pending notifications")

    return await repo.mark_cancelled(notification)


@router.post("/retry-failed", response_model=TriggerScanResponse)
async def retry_failed_notifications(
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Reset failed notifications for retry. OWNER and ADMIN only.
    Only retries notifications under the max retry count (3).
    """
    engine = ReminderEngine(db)
    count = await engine.retry_failed(current_user.gym_id)
    return TriggerScanResponse(reminders_scheduled=count)
