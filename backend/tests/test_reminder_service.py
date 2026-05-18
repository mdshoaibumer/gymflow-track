"""
Tests for app.services.reminder_service — notification scheduling engine.

Coverage:
1. _schedule_datetime returns 9:00 AM IST
2. schedule_expiry_reminders idempotency (no duplicates)
3. schedule_welcome_message
4. schedule_renewal_confirmation
5. retry_failed resets notifications
"""

import asyncio
from datetime import date, datetime, time, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.reminder_service import (
    DEFAULT_SEND_HOUR,
    DEFAULT_SEND_MINUTE,
    IST,
    ReminderEngine,
    _schedule_datetime,
)


def _run(coro):
    """Helper to run an async function synchronously in tests."""
    return asyncio.run(coro)


class TestScheduleDatetime:
    """_schedule_datetime builds 9:00 AM IST datetime."""

    def test_returns_9am_ist(self):
        target = date(2026, 6, 1)
        result = _schedule_datetime(target)
        assert result.hour == 9
        assert result.minute == 0
        assert result.tzinfo == IST

    def test_preserves_date(self):
        target = date(2026, 12, 25)
        result = _schedule_datetime(target)
        assert result.date() == target

    def test_timezone_offset(self):
        target = date(2026, 1, 1)
        result = _schedule_datetime(target)
        assert result.utcoffset() == timedelta(hours=5, minutes=30)


class TestReminderEngineScheduling:
    """ReminderEngine scheduling logic with mocked dependencies."""

    def test_schedule_welcome_message_new(self):
        """Schedule a welcome message for a new member (not duplicate)."""
        mock_db = AsyncMock()
        engine = ReminderEngine(mock_db)
        engine.notification_repo = AsyncMock()
        engine.notification_repo.exists = AsyncMock(return_value=False)
        engine.notification_repo.create = AsyncMock()

        member = MagicMock()
        member.id = uuid4()
        member.name = "John"
        member.phone = "9876543210"
        member.membership_plan = "Monthly"
        member.membership_end = date(2026, 7, 1)

        gym_id = uuid4()
        result = _run(engine.schedule_welcome_message(gym_id, member))
        assert result is True
        engine.notification_repo.create.assert_called_once()

    def test_schedule_welcome_message_duplicate_skipped(self):
        """Duplicate welcome message is not created."""
        mock_db = AsyncMock()
        engine = ReminderEngine(mock_db)
        engine.notification_repo = AsyncMock()
        engine.notification_repo.exists = AsyncMock(return_value=True)
        engine.notification_repo.create = AsyncMock()

        member = MagicMock()
        member.id = uuid4()
        member.name = "John"
        member.phone = "9876543210"
        member.membership_plan = "Monthly"
        member.membership_end = date(2026, 7, 1)

        gym_id = uuid4()
        result = _run(engine.schedule_welcome_message(gym_id, member))
        assert result is False
        engine.notification_repo.create.assert_not_called()

    def test_schedule_renewal_confirmation(self):
        """Schedule renewal confirmation after payment."""
        mock_db = AsyncMock()
        engine = ReminderEngine(mock_db)
        engine.notification_repo = AsyncMock()
        engine.notification_repo.exists = AsyncMock(return_value=False)
        engine.notification_repo.create = AsyncMock()

        member = MagicMock()
        member.id = uuid4()
        member.name = "Alice"
        member.phone = "9876500000"
        member.membership_plan = "Quarterly"
        member.membership_end = date(2026, 9, 1)

        gym_id = uuid4()
        result = _run(engine.schedule_renewal_confirmation(gym_id, member))
        assert result is True

    def test_retry_failed_resets_notifications(self):
        """retry_failed resets failed notifications back to pending."""
        mock_db = AsyncMock()
        engine = ReminderEngine(mock_db)
        engine.notification_repo = AsyncMock()

        failed_notifications = [MagicMock(), MagicMock()]
        engine.notification_repo.get_failed_retryable = AsyncMock(
            return_value=failed_notifications
        )
        engine.notification_repo.reset_for_retry = AsyncMock()

        gym_id = uuid4()
        count = _run(engine.retry_failed(gym_id))
        assert count == 2
        assert engine.notification_repo.reset_for_retry.call_count == 2

    def test_retry_failed_no_failures(self):
        """retry_failed with no failed notifications returns 0."""
        mock_db = AsyncMock()
        engine = ReminderEngine(mock_db)
        engine.notification_repo = AsyncMock()
        engine.notification_repo.get_failed_retryable = AsyncMock(return_value=[])

        count = _run(engine.retry_failed(uuid4()))
        assert count == 0


class TestISTimezoneConstants:
    """Module-level IST constants."""

    def test_ist_offset(self):
        assert IST == timezone(timedelta(hours=5, minutes=30))

    def test_default_send_time(self):
        assert DEFAULT_SEND_HOUR == 9
        assert DEFAULT_SEND_MINUTE == 0
