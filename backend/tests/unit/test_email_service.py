"""Tests for the email service (Resend integration)."""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.email_service import _get_reset_email_html, send_password_reset_email


class TestGetResetEmailHtml:
    """Tests for the HTML template generator."""

    def test_contains_reset_url(self):
        html = _get_reset_email_html("https://example.com/reset?token=abc123", "John")
        assert "https://example.com/reset?token=abc123" in html

    def test_contains_user_name(self):
        html = _get_reset_email_html("https://example.com/reset", "Alice")
        assert "Hi Alice," in html

    def test_contains_reset_button(self):
        html = _get_reset_email_html("https://example.com/reset", "Bob")
        assert "Reset Password" in html

    def test_contains_expiry_notice(self):
        html = _get_reset_email_html("https://example.com/reset", "Bob")
        assert "1 hour" in html


class TestSendPasswordResetEmail:
    """Tests for the send_password_reset_email function."""

    @pytest.mark.asyncio
    async def test_returns_false_when_no_api_key(self):
        """Should gracefully return False when RESEND_API_KEY is not set."""
        with patch("app.services.email_service.settings") as mock_settings:
            mock_settings.RESEND_API_KEY = ""
            mock_settings.FRONTEND_URL = "http://localhost:3000"
            result = await send_password_reset_email("user@test.com", "Test User", "token123")
        assert result is False

    @pytest.mark.asyncio
    async def test_sends_email_when_api_key_set(self):
        """Should call Resend API and return True on success."""
        with patch("app.services.email_service.settings") as mock_settings, \
             patch("app.services.email_service.resend") as mock_resend:
            mock_settings.RESEND_API_KEY = "re_test_key"
            mock_settings.RESEND_FROM_EMAIL = "Test <noreply@test.com>"
            mock_settings.FRONTEND_URL = "http://localhost:3000"
            mock_settings.APP_NAME = "GymFlow Track"
            mock_resend.Emails.send_async = AsyncMock(return_value={"id": "email_123"})

            result = await send_password_reset_email("user@test.com", "Test User", "token123")

        assert result is True
        mock_resend.Emails.send_async.assert_called_once()
        call_args = mock_resend.Emails.send_async.call_args[0][0]
        assert call_args["to"] == ["user@test.com"]
        assert call_args["from"] == "Test <noreply@test.com>"
        assert "Reset your GymFlow Track password" in call_args["subject"]
        assert "token123" in call_args["html"]

    @pytest.mark.asyncio
    async def test_returns_false_on_api_error(self):
        """Should catch exceptions and return False."""
        with patch("app.services.email_service.settings") as mock_settings, \
             patch("app.services.email_service.resend") as mock_resend:
            mock_settings.RESEND_API_KEY = "re_test_key"
            mock_settings.RESEND_FROM_EMAIL = "Test <noreply@test.com>"
            mock_settings.FRONTEND_URL = "http://localhost:3000"
            mock_settings.APP_NAME = "GymFlow Track"
            mock_resend.Emails.send_async = AsyncMock(side_effect=Exception("API error"))

            result = await send_password_reset_email("user@test.com", "Test User", "token123")

        assert result is False

    @pytest.mark.asyncio
    async def test_reset_url_includes_token(self):
        """Should construct correct reset URL with token."""
        with patch("app.services.email_service.settings") as mock_settings, \
             patch("app.services.email_service.resend") as mock_resend:
            mock_settings.RESEND_API_KEY = "re_test_key"
            mock_settings.RESEND_FROM_EMAIL = "Test <noreply@test.com>"
            mock_settings.FRONTEND_URL = "https://app.gymflow.com"
            mock_settings.APP_NAME = "GymFlow Track"
            mock_resend.Emails.send_async = AsyncMock(return_value={"id": "email_123"})

            await send_password_reset_email("user@test.com", "Test User", "my-secret-token")

        call_args = mock_resend.Emails.send_async.call_args[0][0]
        assert "https://app.gymflow.com/reset-password?token=my-secret-token" in call_args["html"]
