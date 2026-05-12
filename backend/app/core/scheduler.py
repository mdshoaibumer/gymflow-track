"""
Background job scheduler for GymFlow.

Architecture:
- Uses APScheduler's AsyncIOScheduler (zero external infrastructure)
- Runs inside the FastAPI process lifecycle (start on startup, stop on shutdown)
- Jobs:
  1. scan_and_schedule: Every hour, scan all gyms for expiring memberships
  2. process_notifications: Every 5 minutes, send pending notifications
  3. retry_failed: Every 6 hours, retry failed notifications
  4. maintenance_scan: Every 12 hours, log overdue maintenance

Why APScheduler (not Celery/Redis):
- Zero additional infrastructure at MVP scale
- Native asyncio support — uses the same event loop as FastAPI
- Sufficient for 100-500 gyms (sub-second scan time)
- When scale demands it, swap to ARQ/Celery — service layer unchanged

Safety:
- Each job acquires its own DB session (independent transaction)
- Jobs are idempotent — running twice produces same result
- APScheduler prevents overlapping executions via max_instances=1
- Every job is wrapped in try/except — one failure never crashes others
- Failures are logged with structured context for operational debugging
"""

import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.database import async_session_factory
from app.services.reminder_service import ReminderEngine
from app.services.notification_processor import NotificationProcessor
from app.services.whatsapp_provider import LogOnlyProvider, WhatsAppProvider

logger = logging.getLogger("gymflow.scheduler")

# Module-level scheduler instance
scheduler = AsyncIOScheduler()

# Provider instance (configured at startup)
_provider: WhatsAppProvider = LogOnlyProvider()

# Job failure counters (for health check visibility)
_job_failures: dict[str, int] = {
    "scan_and_schedule": 0,
    "process_notifications": 0,
    "retry_failed": 0,
    "maintenance_scan": 0,
    "billing_check": 0,
    "token_cleanup": 0,
}


def get_job_health() -> dict[str, int]:
    """Return failure counts for health monitoring."""
    return dict(_job_failures)


def configure_provider(provider: WhatsAppProvider) -> None:
    """Set the WhatsApp provider. Called during app startup."""
    global _provider
    _provider = provider


async def _scan_and_schedule_job() -> None:
    """
    Periodic job: scan all active gyms, schedule reminders.
    Runs every hour — idempotent (duplicates prevented by dedup index).
    """
    from sqlalchemy import select
    from app.models.gym import Gym

    logger.debug("Running scan_and_schedule job")

    try:
        async with async_session_factory() as session:
            async with session.begin():
                result = await session.execute(
                    select(Gym.id).where(Gym.is_active)
                )
                gym_ids = list(result.scalars().all())

                engine = ReminderEngine(session)
                total_created = 0

                for gym_id in gym_ids:
                    created = await engine.schedule_expiry_reminders(gym_id)
                    created += await engine.schedule_overdue_reminders(gym_id)
                    total_created += created

                if total_created:
                    logger.info(f"Scheduled {total_created} reminders across {len(gym_ids)} gyms")
        _job_failures["scan_and_schedule"] = 0
    except Exception:
        _job_failures["scan_and_schedule"] += 1
        logger.exception("scan_and_schedule job failed")


async def _process_notifications_job() -> None:
    """
    Periodic job: send pending notifications that are due.
    Runs every 5 minutes.
    """
    logger.debug("Running process_notifications job")

    try:
        async with async_session_factory() as session:
            async with session.begin():
                processor = NotificationProcessor(session, _provider)
                await processor.process_pending(batch_size=100)
        _job_failures["process_notifications"] = 0
    except Exception:
        _job_failures["process_notifications"] += 1
        logger.exception("process_notifications job failed")


async def _retry_failed_job() -> None:
    """
    Periodic job: reset failed notifications for retry.
    Runs every 6 hours.
    """
    from sqlalchemy import select
    from app.models.gym import Gym

    logger.debug("Running retry_failed job")

    try:
        async with async_session_factory() as session:
            async with session.begin():
                result = await session.execute(
                    select(Gym.id).where(Gym.is_active)
                )
                gym_ids = list(result.scalars().all())

                engine = ReminderEngine(session)
                total_retried = 0

                for gym_id in gym_ids:
                    retried = await engine.retry_failed(gym_id)
                    total_retried += retried

                if total_retried:
                    logger.info(f"Reset {total_retried} failed notifications for retry")
        _job_failures["retry_failed"] = 0
    except Exception:
        _job_failures["retry_failed"] += 1
        logger.exception("retry_failed job failed")


async def _maintenance_scan_job() -> None:
    """
    Periodic job: log overdue maintenance counts per gym.
    Runs every 12 hours. Lightweight — just counts, no writes.
    Future: could create notification records for equipment alerts.
    """
    from datetime import date as date_type
    from sqlalchemy import select
    from app.models.gym import Gym
    from app.repositories.asset_repository import MaintenanceRepository

    logger.debug("Running maintenance_scan job")

    try:
        async with async_session_factory() as session:
            async with session.begin():
                result = await session.execute(
                    select(Gym.id).where(Gym.is_active)
                )
                gym_ids = list(result.scalars().all())

                today = date_type.today()
                repo = MaintenanceRepository(session)

                for gym_id in gym_ids:
                    overdue = await repo.count_overdue(gym_id, today)
                    if overdue:
                        logger.warning(
                            f"Gym {gym_id}: {overdue} overdue maintenance record(s)"
                        )
        _job_failures["maintenance_scan"] = 0
    except Exception:
        _job_failures["maintenance_scan"] += 1
        logger.exception("maintenance_scan job failed")


async def _billing_check_job() -> None:
    """
    Periodic job: check trial and subscription expirations.
    Runs every 1 hour.

    Handles:
    - Expire trials past their end date
    - Expire cancelled subscriptions past their period end
    - Log billing state for operational visibility
    """
    logger.debug("Running billing_check job")

    try:
        async with async_session_factory() as session:
            async with session.begin():
                from app.services.billing_service import (
                    check_trial_expirations,
                    check_subscription_expirations,
                )

                expired_trials = await check_trial_expirations(session)
                expired_subs = await check_subscription_expirations(session)

                if expired_trials or expired_subs:
                    logger.info(
                        f"Billing check: {expired_trials} trial(s) expired, "
                        f"{expired_subs} subscription(s) expired"
                    )
        _job_failures["billing_check"] = 0
    except Exception:
        _job_failures["billing_check"] += 1
        logger.exception("billing_check job failed")


async def _token_cleanup_job() -> None:
    """
    Periodic job: delete stale refresh tokens and used/expired password reset tokens.
    Runs every 24 hours.

    Keeps the auth tables lean:
    - Revoked refresh tokens older than 30 days
    - Expired refresh tokens older than 7 days
    - Used or expired password reset tokens older than 7 days
    """
    from sqlalchemy import delete
    from app.models.auth_token import RefreshToken, PasswordResetToken
    from datetime import timedelta

    logger.debug("Running token_cleanup job")

    try:
        async with async_session_factory() as session:
            async with session.begin():
                now = datetime.now(timezone.utc)

                # Delete revoked refresh tokens older than 30 days
                revoked_cutoff = now - timedelta(days=30)
                result_revoked = await session.execute(
                    delete(RefreshToken).where(
                        RefreshToken.revoked,
                        RefreshToken.updated_at < revoked_cutoff,
                    )
                )

                # Delete expired refresh tokens older than 7 days
                expired_cutoff = now - timedelta(days=7)
                result_expired = await session.execute(
                    delete(RefreshToken).where(
                        RefreshToken.expires_at < expired_cutoff,
                    )
                )

                # Delete used/expired password reset tokens older than 7 days
                result_reset = await session.execute(
                    delete(PasswordResetToken).where(
                        PasswordResetToken.created_at < expired_cutoff,
                        PasswordResetToken.used | (PasswordResetToken.expires_at < now),
                    )
                )

                total = (
                    result_revoked.rowcount
                    + result_expired.rowcount
                    + result_reset.rowcount
                )
                if total:
                    logger.info(
                        f"Token cleanup: removed {result_revoked.rowcount} revoked refresh, "
                        f"{result_expired.rowcount} expired refresh, "
                        f"{result_reset.rowcount} used/expired reset tokens"
                    )
        _job_failures["token_cleanup"] = 0
    except Exception:
        _job_failures["token_cleanup"] += 1
        logger.exception("token_cleanup job failed")


def start_scheduler() -> None:
    """Start the background scheduler. Called during FastAPI lifespan startup."""
    scheduler.add_job(
        _scan_and_schedule_job,
        trigger=IntervalTrigger(hours=1),
        id="scan_and_schedule",
        name="Scan memberships and schedule reminders",
        max_instances=1,
        replace_existing=True,
    )
    scheduler.add_job(
        _process_notifications_job,
        trigger=IntervalTrigger(minutes=5),
        id="process_notifications",
        name="Process pending notifications",
        max_instances=1,
        replace_existing=True,
    )
    scheduler.add_job(
        _retry_failed_job,
        trigger=IntervalTrigger(hours=6),
        id="retry_failed",
        name="Retry failed notifications",
        max_instances=1,
        replace_existing=True,
    )
    scheduler.add_job(
        _maintenance_scan_job,
        trigger=IntervalTrigger(hours=12),
        id="maintenance_scan",
        name="Scan for overdue maintenance",
        max_instances=1,
        replace_existing=True,
    )
    scheduler.add_job(
        _billing_check_job,
        trigger=IntervalTrigger(hours=1),
        id="billing_check",
        name="Check trial/subscription expirations",
        max_instances=1,
        replace_existing=True,
    )
    scheduler.add_job(
        _token_cleanup_job,
        trigger=IntervalTrigger(hours=24),
        id="token_cleanup",
        name="Clean up expired/revoked tokens",
        max_instances=1,
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "Background scheduler started "
        "(scan=1h, process=5m, retry=6h, maint=12h, billing=1h, token_cleanup=24h)"
    )


def stop_scheduler() -> None:
    """Stop the scheduler gracefully. Called during FastAPI shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Background scheduler stopped")
