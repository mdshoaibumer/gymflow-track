"""
Notification processing service.

Responsibilities:
1. Pick up PENDING notifications whose scheduled_for <= now
2. Build WhatsApp message from notification payload
3. Send via provider
4. Mark as SENT or FAILED

This is called by the background scheduler at regular intervals.
It's designed to be safe for concurrent execution (each notification
is processed exactly once due to status transitions).
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationStatus
from app.repositories.notification_repository import NotificationRepository
from app.services.whatsapp_provider import (
    WhatsAppProvider,
    build_message_from_notification,
)

logger = logging.getLogger("gymflow.notifications")


class NotificationProcessor:
    """Processes pending notifications through the WhatsApp provider."""

    def __init__(self, db: AsyncSession, provider: WhatsAppProvider):
        self.db = db
        self.notification_repo = NotificationRepository(db)
        self.provider = provider

    async def process_pending(self, batch_size: int = 50) -> dict:
        """
        Process pending notifications in batches until none remain.

        Returns:
            Dict with sent/failed counts for logging.
        """
        now = datetime.now(timezone.utc)
        sent = 0
        failed = 0

        while True:
            pending = await self.notification_repo.get_pending_due(now, limit=batch_size)
            if not pending:
                break

            for notification in pending:
                success = await self._send_notification(notification)
                if success:
                    sent += 1
                else:
                    failed += 1

        if sent or failed:
            logger.info(
                f"Processed {sent + failed} notifications: "
                f"{sent} sent, {failed} failed "
                f"(provider={self.provider.provider_name()})"
            )

        return {"sent": sent, "failed": failed}

    async def _send_notification(self, notification: Notification) -> bool:
        """
        Send a single notification. Returns True if successful.

        Flow:
        1. Build message from notification payload
        2. Call provider
        3. Update notification status
        """
        try:
            phone = (notification.payload or {}).get("member_phone", "")
            if not phone:
                await self.notification_repo.mark_failed(
                    notification, "No phone number in payload"
                )
                return False

            message = build_message_from_notification(
                notification_type=notification.notification_type.value,
                phone=phone,
                payload=notification.payload or {},
            )

            result = await self.provider.send_template_message(message)

            if result.success:
                await self.notification_repo.mark_sent(
                    notification, datetime.now(timezone.utc)
                )
                return True
            else:
                await self.notification_repo.mark_failed(
                    notification, result.error_message or "Unknown error"
                )
                return False

        except Exception as e:
            logger.error(f"Error processing notification {notification.id}: {e}")
            await self.notification_repo.mark_failed(notification, str(e))
            return False
