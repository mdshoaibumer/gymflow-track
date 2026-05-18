"""
Tests for app.services.whatsapp_provider — provider abstraction layer.

Coverage:
1. LogOnlyProvider — logs without sending
2. AiSensyProvider — HTTP call structure (mocked)
3. build_message_from_notification — template mapping and variable construction
4. WhatsAppMessage dataclass
5. SendResult dataclass
6. Phone number formatting (country code prepend)
"""

import asyncio

import pytest  # noqa: F401
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.whatsapp_provider import (
    AiSensyProvider,
    LogOnlyProvider,
    SendResult,
    TEMPLATE_MAP,
    WhatsAppMessage,
    build_message_from_notification,
)


def _run(coro):
    """Helper to run an async function synchronously in tests."""
    return asyncio.run(coro)


class TestWhatsAppMessage:
    """WhatsAppMessage dataclass."""

    def test_create_message(self):
        msg = WhatsAppMessage(
            phone="919876543210",
            template_name="welcome_new_member",
            variables=["John", "Monthly"],
        )
        assert msg.phone == "919876543210"
        assert msg.template_name == "welcome_new_member"
        assert msg.variables == ["John", "Monthly"]
        assert msg.language == "en"  # default

    def test_custom_language(self):
        msg = WhatsAppMessage(
            phone="919876543210",
            template_name="test",
            variables=[],
            language="hi",
        )
        assert msg.language == "hi"


class TestSendResult:
    """SendResult dataclass."""

    def test_success_result(self):
        result = SendResult(success=True, provider_message_id="msg_123")
        assert result.success is True
        assert result.provider_message_id == "msg_123"
        assert result.error_message is None

    def test_failure_result(self):
        result = SendResult(success=False, error_message="Timeout")
        assert result.success is False
        assert result.error_message == "Timeout"
        assert result.provider_message_id is None


class TestLogOnlyProvider:
    """LogOnlyProvider logs messages without external calls."""

    def test_send_returns_success(self):
        provider = LogOnlyProvider()
        msg = WhatsAppMessage(
            phone="919876543210",
            template_name="test_template",
            variables=["var1", "var2"],
        )
        result = _run(provider.send_template_message(msg))
        assert result.success is True
        assert result.provider_message_id == "log_only_mock"

    def test_provider_name(self):
        provider = LogOnlyProvider()
        assert provider.provider_name() == "log_only"


class TestAiSensyProvider:
    """AiSensyProvider with mocked HTTP calls."""

    def test_successful_send(self):
        provider = AiSensyProvider(api_key="test_api_key")
        msg = WhatsAppMessage(
            phone="919876543210",
            template_name="welcome_new_member",
            variables=["John", "Monthly"],
        )

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": {"id": "aisensy_msg_123"}}

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = _run(provider.send_template_message(msg))

        assert result.success is True
        assert result.provider_message_id == "aisensy_msg_123"

    def test_failed_send_http_error(self):
        provider = AiSensyProvider(api_key="test_api_key")
        msg = WhatsAppMessage(
            phone="919876543210",
            template_name="test",
            variables=["John"],
        )

        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = _run(provider.send_template_message(msg))

        assert result.success is False
        assert "401" in result.error_message

    def test_timeout_error(self):
        import httpx

        provider = AiSensyProvider(api_key="test_api_key")
        msg = WhatsAppMessage(
            phone="919876543210",
            template_name="test",
            variables=["John"],
        )

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post.side_effect = httpx.TimeoutException("timed out")
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = _run(provider.send_template_message(msg))

        assert result.success is False
        assert "timed out" in result.error_message

    def test_provider_name(self):
        provider = AiSensyProvider(api_key="key")
        assert provider.provider_name() == "aisensy"


class TestBuildMessageFromNotification:
    """Template mapping and message construction."""

    def test_expiry_7_days_template(self):
        msg = build_message_from_notification(
            notification_type="expiry_7_days",
            phone="9876543210",
            payload={
                "member_name": "John",
                "membership_end": "2026-06-01",
                "membership_plan": "Monthly",
            },
        )
        assert msg.template_name == "membership_expiry_7day"
        assert msg.variables == ["John", "2026-06-01", "Monthly"]

    def test_expiry_3_days_template(self):
        msg = build_message_from_notification(
            notification_type="expiry_3_days",
            phone="9876543210",
            payload={
                "member_name": "Alice",
                "membership_end": "2026-05-21",
                "membership_plan": "Quarterly",
            },
        )
        assert msg.template_name == "membership_expiry_3day"
        assert msg.variables == ["Alice", "2026-05-21", "Quarterly"]

    def test_membership_expired_template(self):
        msg = build_message_from_notification(
            notification_type="membership_expired",
            phone="9876543210",
            payload={"member_name": "Bob", "membership_plan": "Annual"},
        )
        assert msg.template_name == "membership_expired_notice"
        assert msg.variables == ["Bob", "Annual"]

    def test_payment_overdue_template(self):
        msg = build_message_from_notification(
            notification_type="payment_overdue",
            phone="9876543210",
            payload={"member_name": "Charlie"},
        )
        assert msg.template_name == "payment_overdue_reminder"
        assert msg.variables == ["Charlie"]

    def test_welcome_template(self):
        msg = build_message_from_notification(
            notification_type="welcome",
            phone="9876543210",
            payload={"member_name": "Dave", "membership_plan": "Monthly"},
        )
        assert msg.template_name == "welcome_new_member"
        assert msg.variables == ["Dave", "Monthly"]

    def test_renewal_confirmation_template(self):
        msg = build_message_from_notification(
            notification_type="renewal_confirmation",
            phone="9876543210",
            payload={
                "member_name": "Eve",
                "membership_end": "2027-01-01",
                "membership_plan": "Annual",
            },
        )
        assert msg.template_name == "renewal_confirmed"
        assert msg.variables == ["Eve", "2027-01-01", "Annual"]

    def test_unknown_type_uses_generic_template(self):
        msg = build_message_from_notification(
            notification_type="unknown_type",
            phone="9876543210",
            payload={"member_name": "Test"},
        )
        assert msg.template_name == "generic_notification"
        assert msg.variables == ["Test"]

    def test_phone_without_country_code_gets_91_prepended(self):
        msg = build_message_from_notification(
            notification_type="welcome",
            phone="9876543210",
            payload={"member_name": "Test"},
        )
        assert msg.phone == "919876543210"

    def test_phone_with_91_prefix_unchanged(self):
        msg = build_message_from_notification(
            notification_type="welcome",
            phone="919876543210",
            payload={"member_name": "Test"},
        )
        assert msg.phone == "919876543210"

    def test_phone_with_plus_prefix_unchanged(self):
        msg = build_message_from_notification(
            notification_type="welcome",
            phone="+919876543210",
            payload={"member_name": "Test"},
        )
        assert msg.phone == "+919876543210"

    def test_missing_payload_fields_default_to_empty(self):
        msg = build_message_from_notification(
            notification_type="expiry_7_days",
            phone="9876543210",
            payload={},
        )
        assert msg.variables == ["Member", "", ""]


class TestTemplateMap:
    """Verify TEMPLATE_MAP has all expected entries."""

    def test_all_notification_types_mapped(self):
        expected_types = [
            "expiry_7_days",
            "expiry_3_days",
            "membership_expired",
            "payment_overdue",
            "welcome",
            "renewal_confirmation",
        ]
        for nt in expected_types:
            assert nt in TEMPLATE_MAP
