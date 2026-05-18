"""
Tests for app.services.notification_processor — notification processing service.

Coverage:
1. process_pending with no pending notifications
2. process_pending with LogOnlyProvider (logged mode)
3. Notification with no phone marked as failed
4. Provider resolution caching
5. Send result tracking (sent/failed/logged counts)
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest  # noqa: F401

from app.services.notification_processor import NotificationProcessor
from app.services.whatsapp_provider import LogOnlyProvider


def _run(coro):
    """Helper to run an async function synchronously in tests."""
    return asyncio.run(coro)


class TestNotificationProcessorProcessPending:
    """NotificationProcessor.process_pending() behavior."""

    def test_no_pending_returns_zeros(self):
        """When no notifications are pending, all counts are zero."""
        mock_db = AsyncMock()
        processor = NotificationProcessor(mock_db, fallback_provider=LogOnlyProvider())

        # Mock the notification repo to return empty
        processor.notification_repo = AsyncMock()
        processor.notification_repo.get_pending_due = AsyncMock(return_value=[])

        result = _run(processor.process_pending())
        assert result == {"sent": 0, "failed": 0, "logged": 0}

    def test_notification_without_phone_marked_failed(self):
        """Notifications missing phone number are marked as failed."""
        mock_db = AsyncMock()
        processor = NotificationProcessor(mock_db, fallback_provider=LogOnlyProvider())

        # Create a mock notification without phone
        notification = MagicMock()
        notification.id = uuid4()
        notification.gym_id = uuid4()
        notification.notification_type = MagicMock(value="welcome")
        notification.payload = {"member_name": "John"}  # No member_phone

        processor.notification_repo = AsyncMock()
        processor.notification_repo.get_pending_due = AsyncMock(
            side_effect=[[notification], []]
        )
        processor.notification_repo.mark_failed = AsyncMock()

        result = _run(processor.process_pending())
        assert result["failed"] == 1
        processor.notification_repo.mark_failed.assert_called_once()

    def test_log_only_provider_counts_as_logged(self):
        """Notifications sent through LogOnlyProvider count as 'logged'."""
        mock_db = AsyncMock()
        processor = NotificationProcessor(mock_db, fallback_provider=LogOnlyProvider())

        notification = MagicMock()
        notification.id = uuid4()
        notification.gym_id = uuid4()
        notification.notification_type = MagicMock(value="welcome")
        notification.payload = {
            "member_name": "John",
            "member_phone": "9876543210",
            "membership_plan": "Monthly",
        }

        processor.notification_repo = AsyncMock()
        processor.notification_repo.get_pending_due = AsyncMock(
            side_effect=[[notification], []]
        )
        processor.notification_repo.mark_sent = AsyncMock()

        # Provider cache: force LogOnlyProvider for this gym
        processor._provider_cache[notification.gym_id] = LogOnlyProvider()

        result = _run(processor.process_pending())
        assert result["logged"] == 1
        assert result["sent"] == 0

    def test_exception_during_send_marks_failed(self):
        """If provider raises, notification is marked failed."""
        mock_db = AsyncMock()
        failing_provider = AsyncMock()
        failing_provider.send_template_message = AsyncMock(
            side_effect=RuntimeError("Connection refused")
        )
        failing_provider.provider_name = MagicMock(return_value="test")

        processor = NotificationProcessor(mock_db, fallback_provider=LogOnlyProvider())

        notification = MagicMock()
        notification.id = uuid4()
        notification.gym_id = uuid4()
        notification.notification_type = MagicMock(value="welcome")
        notification.payload = {
            "member_name": "John",
            "member_phone": "9876543210",
        }

        processor.notification_repo = AsyncMock()
        processor.notification_repo.get_pending_due = AsyncMock(
            side_effect=[[notification], []]
        )
        processor.notification_repo.mark_failed = AsyncMock()
        processor._provider_cache[notification.gym_id] = failing_provider

        result = _run(processor.process_pending())
        assert result["failed"] == 1


class TestProviderResolution:
    """Provider resolution caching and logic."""

    def test_provider_cache_reused(self):
        """Same gym_id reuses cached provider."""
        mock_db = AsyncMock()
        processor = NotificationProcessor(mock_db, fallback_provider=LogOnlyProvider())

        gym_id = uuid4()
        provider = LogOnlyProvider()
        processor._provider_cache[gym_id] = provider

        resolved = _run(processor._resolve_provider(gym_id))
        assert resolved is provider

    def test_fallback_provider_used_when_no_config(self):
        """Without WhatsApp config, fallback (LogOnly) is used."""
        mock_db = AsyncMock()
        fallback = LogOnlyProvider()
        processor = NotificationProcessor(mock_db, fallback_provider=fallback)

        gym_id = uuid4()

        # Mock DB query to return no config
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        resolved = _run(processor._resolve_provider(gym_id))
        assert resolved is fallback
