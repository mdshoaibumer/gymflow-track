"""
Reminder Engine — schedules notifications based on membership lifecycle events.

Core responsibilities:
1. Scan members for upcoming expirations → schedule reminders
2. Detect overdue payments → schedule payment reminders
3. Schedule welcome messages for new members
4. Prevent duplicate scheduling (idempotent)

This service is called by:
- Background job (periodic scan every hour)
- Event handlers (on payment recorded → schedule renewal confirmation)
- Manual trigger from admin UI (retry failed)

Scheduling strategy:
- Reminders are scheduled for 9:00 AM IST on the target date
- This ensures messages arrive during business hours
- The background processor picks up PENDING notifications whose scheduled_for <= now

Duplicate prevention:
- Before creating, check exists() on (gym_id, member_id, type, scheduled_for)
- The DB has a unique index as a safety net
- Running the scheduler multiple times is safe (idempotent)
"""

import logging
from datetime import date, datetime, timedelta, timezone, time
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member, MembershipStatus
from app.core.timezone import today_ist
from app.models.notification import (
    Notification,
    NotificationChannel,
    NotificationStatus,
    NotificationType,
)
from app.repositories.member_repository import MemberRepository
from app.repositories.notification_repository import NotificationRepository

logger = logging.getLogger("gymflow.reminders")

# IST timezone offset (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

# Default send time: 9:00 AM IST
DEFAULT_SEND_HOUR = 9
DEFAULT_SEND_MINUTE = 0


def _schedule_datetime(target_date: date) -> datetime:
    """Create a timezone-aware datetime at 9:00 AM IST for the given date."""
    return datetime.combine(
        target_date,
        time(DEFAULT_SEND_HOUR, DEFAULT_SEND_MINUTE),
        tzinfo=IST,
    )


class ReminderEngine:
    """
    Scans membership data and schedules notifications.
    All operations are idempotent — safe to call repeatedly.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.notification_repo = NotificationRepository(db)
        self.member_repo = MemberRepository(db)

    async def schedule_expiry_reminders(self, gym_id: UUID) -> int:
        """
        Schedule expiry reminders for a single gym.
        Returns count of NEW notifications created.

        Scans for:
        - Members expiring in exactly 7 days → EXPIRY_7_DAYS
        - Members expiring in exactly 3 days → EXPIRY_3_DAYS
        - Members expired today or yesterday → MEMBERSHIP_EXPIRED
        """
        created = 0
        today = today_ist()

        # 7-day warning
        target_7 = today + timedelta(days=7)
        members_7 = await self._get_members_expiring_on(gym_id, target_7)
        for member in members_7:
            if await self._schedule_if_new(
                gym_id, member, NotificationType.EXPIRY_7_DAYS, today
            ):
                created += 1

        # 3-day warning
        target_3 = today + timedelta(days=3)
        members_3 = await self._get_members_expiring_on(gym_id, target_3)
        for member in members_3:
            if await self._schedule_if_new(
                gym_id, member, NotificationType.EXPIRY_3_DAYS, today
            ):
                created += 1

        # Expired (yesterday or today)
        expired_members = await self.member_repo.get_expired_not_synced(gym_id)
        for member in expired_members:
            if await self._schedule_if_new(
                gym_id, member, NotificationType.MEMBERSHIP_EXPIRED, today
            ):
                created += 1

        logger.info(f"[{gym_id}] Scheduled {created} expiry reminders")
        return created

    async def schedule_overdue_reminders(self, gym_id: UUID) -> int:
        """
        Schedule reminders for members with overdue payments (pending status).
        One reminder per member per day maximum.
        """
        created = 0
        today = today_ist()

        # Get members with pending payments
        # We use a targeted query to find distinct members with pending payments
        from sqlalchemy import select, distinct
        from app.models.payment import Payment, PaymentStatus

        result = await self.db.execute(
            select(distinct(Payment.member_id)).where(
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.PENDING,
            )
        )
        overdue_member_ids = list(result.scalars().all())

        for member_id in overdue_member_ids:
            member = await self.member_repo.get_by_id(member_id, gym_id)
            if member and member.membership_status != MembershipStatus.CANCELLED:
                if await self._schedule_if_new(
                    gym_id, member, NotificationType.PAYMENT_OVERDUE, today
                ):
                    created += 1

        logger.info(f"[{gym_id}] Scheduled {created} overdue payment reminders")
        return created

    async def schedule_welcome_message(self, gym_id: UUID, member: Member) -> bool:
        """
        Schedule a welcome message for a newly added member.
        Called from the member creation event handler.
        Returns True if scheduled, False if already exists.
        """
        today = today_ist()
        return await self._schedule_if_new(
            gym_id, member, NotificationType.WELCOME, today
        )

    async def schedule_renewal_confirmation(
        self, gym_id: UUID, member: Member
    ) -> bool:
        """
        Schedule a renewal confirmation after successful payment.
        Called from the payment recorded event handler.
        """
        today = today_ist()
        return await self._schedule_if_new(
            gym_id, member, NotificationType.RENEWAL_CONFIRMATION, today
        )

    async def _schedule_if_new(
        self,
        gym_id: UUID,
        member: Member,
        notification_type: NotificationType,
        target_date: date,
    ) -> bool:
        """
        Create a notification only if one doesn't already exist.
        This is the idempotency guard.
        Returns True if created, False if duplicate.
        """
        scheduled_for = _schedule_datetime(target_date)

        # Dedup check
        already_exists = await self.notification_repo.exists(
            gym_id=gym_id,
            member_id=member.id,
            notification_type=notification_type,
            scheduled_for=scheduled_for,
        )
        if already_exists:
            return False

        # Build payload for template rendering
        payload = {
            "member_name": member.name,
            "member_phone": member.phone,
            "membership_plan": member.membership_plan,
            "membership_end": str(member.membership_end) if member.membership_end else None,
        }

        notification = Notification(
            gym_id=gym_id,
            member_id=member.id,
            notification_type=notification_type,
            channel=NotificationChannel.WHATSAPP,
            status=NotificationStatus.PENDING,
            scheduled_for=scheduled_for,
            payload=payload,
        )
        await self.notification_repo.create(notification)
        return True

    async def _get_members_expiring_on(
        self, gym_id: UUID, target_date: date
    ) -> list[Member]:
        """Get members whose membership_end is exactly on target_date."""
        from sqlalchemy import select
        result = await self.db.execute(
            select(Member).where(
                Member.gym_id == gym_id,
                Member.membership_status == MembershipStatus.ACTIVE,
                Member.membership_end == target_date,
            )
        )
        return list(result.scalars().all())

    async def retry_failed(self, gym_id: UUID, max_retries: int = 3) -> int:
        """Reset failed notifications (under retry limit) back to PENDING."""
        failed = await self.notification_repo.get_failed_retryable(gym_id, max_retries)
        count = 0
        for notification in failed:
            await self.notification_repo.reset_for_retry(notification)
            count += 1
        logger.info(f"[{gym_id}] Reset {count} failed notifications for retry")
        return count
