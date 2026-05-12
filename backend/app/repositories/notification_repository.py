from datetime import datetime
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import (
    Notification,
    NotificationStatus,
    NotificationType,
)


class NotificationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, notification: Notification) -> Notification:
        self.db.add(notification)
        await self.db.flush()
        return notification

    async def get_by_id(self, notification_id: UUID, gym_id: UUID) -> Notification | None:
        result = await self.db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.gym_id == gym_id,
            )
        )
        return result.scalar_one_or_none()

    async def exists(
        self,
        gym_id: UUID,
        member_id: UUID,
        notification_type: NotificationType,
        scheduled_for: datetime,
    ) -> bool:
        """
        Check if a notification already exists (dedup check).
        Uses the unique composite index for fast lookup.
        """
        result = await self.db.execute(
            select(func.count()).select_from(Notification).where(
                Notification.gym_id == gym_id,
                Notification.member_id == member_id,
                Notification.notification_type == notification_type,
                Notification.scheduled_for == scheduled_for,
            )
        )
        return result.scalar_one() > 0

    async def list_by_gym(
        self,
        gym_id: UUID,
        skip: int = 0,
        limit: int = 50,
        status: NotificationStatus | None = None,
        notification_type: NotificationType | None = None,
    ) -> list[Notification]:
        query = select(Notification).where(Notification.gym_id == gym_id)

        if status:
            query = query.where(Notification.status == status)
        if notification_type:
            query = query.where(Notification.notification_type == notification_type)

        result = await self.db.execute(
            query.order_by(Notification.scheduled_for.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_by_gym(
        self,
        gym_id: UUID,
        status: NotificationStatus | None = None,
        notification_type: NotificationType | None = None,
    ) -> int:
        query = (
            select(func.count())
            .select_from(Notification)
            .where(Notification.gym_id == gym_id)
        )
        if status:
            query = query.where(Notification.status == status)
        if notification_type:
            query = query.where(Notification.notification_type == notification_type)

        result = await self.db.execute(query)
        return result.scalar_one()

    async def get_pending_due(self, now: datetime, limit: int = 100) -> list[Notification]:
        """
        Get pending notifications that are due for sending.
        Used by the background job processor.
        Ordered by scheduled_for ASC so oldest-due are processed first.
        Uses FOR UPDATE SKIP LOCKED to prevent duplicate sends when
        multiple scheduler instances overlap.
        """
        result = await self.db.execute(
            select(Notification)
            .where(
                Notification.status == NotificationStatus.PENDING,
                Notification.scheduled_for <= now,
            )
            .order_by(Notification.scheduled_for.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        return list(result.scalars().all())

    async def mark_sent(self, notification: Notification, sent_at: datetime) -> Notification:
        notification.status = NotificationStatus.SENT
        notification.sent_at = sent_at
        await self.db.flush()
        return notification

    async def mark_failed(
        self, notification: Notification, reason: str
    ) -> Notification:
        notification.status = NotificationStatus.FAILED
        notification.failure_reason = reason
        notification.retry_count += 1
        await self.db.flush()
        return notification

    async def mark_cancelled(self, notification: Notification) -> Notification:
        notification.status = NotificationStatus.CANCELLED
        await self.db.flush()
        return notification

    async def reset_for_retry(self, notification: Notification) -> Notification:
        """Reset a failed notification back to PENDING for retry."""
        notification.status = NotificationStatus.PENDING
        notification.failure_reason = None
        await self.db.flush()
        return notification

    async def get_failed_retryable(
        self, gym_id: UUID, max_retries: int = 3
    ) -> list[Notification]:
        """Get failed notifications that haven't exceeded retry limit."""
        result = await self.db.execute(
            select(Notification).where(
                Notification.gym_id == gym_id,
                Notification.status == NotificationStatus.FAILED,
                Notification.retry_count < max_retries,
            )
        )
        return list(result.scalars().all())

    async def count_sent_today(self, gym_id: UUID, today_start: datetime) -> int:
        """Count notifications sent today — for dashboard widget."""
        result = await self.db.execute(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.gym_id == gym_id,
                Notification.status == NotificationStatus.SENT,
                Notification.sent_at >= today_start,
            )
        )
        return result.scalar_one()

    async def count_failed_unresolved(self, gym_id: UUID) -> int:
        """Count failed notifications that need attention."""
        result = await self.db.execute(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.gym_id == gym_id,
                Notification.status == NotificationStatus.FAILED,
            )
        )
        return result.scalar_one()

    async def count_upcoming_scheduled(self, gym_id: UUID, after: datetime) -> int:
        """Count future-scheduled pending notifications (upcoming, not yet due)."""
        result = await self.db.execute(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.gym_id == gym_id,
                Notification.status == NotificationStatus.PENDING,
                Notification.scheduled_for > after,
            )
        )
        return result.scalar_one()

    async def get_upcoming(
        self, gym_id: UUID, limit: int = 20
    ) -> list[Notification]:
        """Get upcoming pending notifications for preview."""
        result = await self.db.execute(
            select(Notification)
            .where(
                Notification.gym_id == gym_id,
                Notification.status == NotificationStatus.PENDING,
            )
            .order_by(Notification.scheduled_for.asc())
            .limit(limit)
        )
        return list(result.scalars().all())
