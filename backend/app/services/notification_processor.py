"""
Notification processing service.

Responsibilities:
1. Pick up PENDING notifications whose scheduled_for <= now
2. Resolve the correct provider per-gym (AiSensy if configured, LogOnly otherwise)
3. Build WhatsApp message from notification payload
4. Send via the resolved provider
5. Mark as SENT or FAILED

Per-gym provider resolution:
- If gym has WhatsApp config with valid API key AND automation enabled → AiSensy
- Otherwise → LogOnly (messages logged but not sent — manual mode)
- Subscription plan feature gating also checked (automated_whatsapp_enabled)

This is called by the background scheduler at regular intervals.
It's designed to be safe for concurrent execution (each notification
is processed exactly once due to status transitions).
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.subscription import GymSubscription, SubscriptionPlan
from app.models.whatsapp_config import WhatsAppConfig
from app.repositories.notification_repository import NotificationRepository
from app.services.whatsapp_provider import (
    AiSensyProvider,
    LogOnlyProvider,
    WhatsAppProvider,
    build_message_from_notification,
)

logger = logging.getLogger("gymflow.notifications")


class NotificationProcessor:
    """
    Processes pending notifications through the appropriate WhatsApp provider.

    Provider resolution per gym:
    1. Check if gym has WhatsAppConfig with is_enabled=True
    2. Check if gym's subscription plan has automated_whatsapp_enabled=True
    3. If both → use AiSensyProvider with gym's API key
    4. Otherwise → use LogOnlyProvider (manual mode, message just logged)
    """

    def __init__(self, db: AsyncSession, fallback_provider: WhatsAppProvider | None = None):
        self.db = db
        self.notification_repo = NotificationRepository(db)
        self.fallback_provider = fallback_provider or LogOnlyProvider()
        # Cache resolved providers per gym_id within this batch
        self._provider_cache: dict[UUID, WhatsAppProvider] = {}

    async def _resolve_provider(self, gym_id: UUID) -> WhatsAppProvider:
        """
        Resolve the correct WhatsApp provider for a gym.

        Returns AiSensyProvider if:
        - Gym has WhatsAppConfig with is_enabled=True
        - Gym's subscription plan has automated_whatsapp_enabled=True

        Otherwise returns LogOnlyProvider (manual/log mode).
        """
        if gym_id in self._provider_cache:
            return self._provider_cache[gym_id]

        provider: WhatsAppProvider = self.fallback_provider

        # Check gym's WhatsApp configuration
        config_result = await self.db.execute(
            select(WhatsAppConfig).where(
                WhatsAppConfig.gym_id == gym_id,
                WhatsAppConfig.is_enabled == True,  # noqa: E712
            )
        )
        config = config_result.scalar_one_or_none()

        if config and config.api_key:
            # Check subscription plan allows automated WhatsApp
            plan_result = await self.db.execute(
                select(SubscriptionPlan.automated_whatsapp_enabled)
                .join(GymSubscription, GymSubscription.plan_id == SubscriptionPlan.id)
                .where(GymSubscription.gym_id == gym_id)
            )
            plan_allows = plan_result.scalar_one_or_none()

            if plan_allows:
                provider = AiSensyProvider(
                    api_key=config.api_key,
                    base_url=config.provider_url,
                )
                logger.debug(f"Gym {gym_id}: using AiSensy provider")
            else:
                logger.debug(
                    f"Gym {gym_id}: WhatsApp configured but plan does not allow automation. "
                    f"Using log-only mode."
                )
        else:
            logger.debug(f"Gym {gym_id}: no WhatsApp config. Using log-only mode.")

        self._provider_cache[gym_id] = provider
        return provider

    async def process_pending(self, batch_size: int = 50) -> dict:
        """
        Process pending notifications in batches until none remain.

        Returns:
            Dict with sent/failed/logged counts for logging.
        """
        now = datetime.now(timezone.utc)
        sent = 0
        failed = 0
        logged = 0

        while True:
            pending = await self.notification_repo.get_pending_due(now, limit=batch_size)
            if not pending:
                break

            for notification in pending:
                result = await self._send_notification(notification)
                if result == "sent":
                    sent += 1
                elif result == "logged":
                    logged += 1
                else:
                    failed += 1

        if sent or failed or logged:
            logger.info(
                f"Processed {sent + failed + logged} notifications: "
                f"{sent} sent via AiSensy, {logged} logged (manual mode), {failed} failed"
            )

        return {"sent": sent, "failed": failed, "logged": logged}

    async def _send_notification(self, notification: Notification) -> str:
        """
        Send a single notification. Returns 'sent', 'logged', or 'failed'.

        Flow:
        1. Resolve provider for this gym
        2. Build message from notification payload
        3. Call provider
        4. Update notification status
        """
        try:
            phone = (notification.payload or {}).get("member_phone", "")
            if not phone:
                await self.notification_repo.mark_failed(
                    notification, "No phone number in payload"
                )
                return "failed"

            # Resolve provider for this gym
            provider = await self._resolve_provider(notification.gym_id)

            message = build_message_from_notification(
                notification_type=notification.notification_type.value,
                phone=phone,
                payload=notification.payload or {},
            )

            result = await provider.send_template_message(message)

            if result.success:
                await self.notification_repo.mark_sent(
                    notification, datetime.now(timezone.utc)
                )
                # Distinguish between real send and log-only
                if provider.provider_name() == "log_only":
                    return "logged"
                return "sent"
            else:
                await self.notification_repo.mark_failed(
                    notification, result.error_message or "Unknown error"
                )
                return "failed"

        except Exception as e:
            logger.error(f"Error processing notification {notification.id}: {e}")
            await self.notification_repo.mark_failed(notification, str(e))
            return "failed"
