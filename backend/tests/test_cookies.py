"""
Tests for app.core.cookies — HttpOnly cookie utilities.

Coverage:
1. set_auth_cookies sets access, refresh, and persist cookies
2. clear_auth_cookies removes cookies
3. Cookie security attributes (HttpOnly, Secure, SameSite, Path)
"""

from unittest.mock import MagicMock, patch  # noqa: F401

import pytest  # noqa: F401

from app.core.cookies import (
    ACCESS_COOKIE,
    PERSIST_COOKIE,
    REFRESH_COOKIE,
    clear_auth_cookies,
    set_auth_cookies,
)


class TestSetAuthCookies:
    """set_auth_cookies sets both tokens as HttpOnly cookies."""

    @patch("app.core.cookies.settings")
    def test_sets_access_cookie(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "access_token_123", "refresh_token_456", remember_me=True)

        # Verify set_cookie was called for access, refresh, and persist
        calls = response.set_cookie.call_args_list
        assert len(calls) == 3

        # First call: access token
        access_call = calls[0]
        assert access_call.kwargs["key"] == ACCESS_COOKIE
        assert access_call.kwargs["value"] == "access_token_123"
        assert access_call.kwargs["httponly"] is True
        assert access_call.kwargs["secure"] is True
        assert access_call.kwargs["path"] == "/"

    @patch("app.core.cookies.settings")
    def test_sets_refresh_cookie_with_auth_path(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "access_123", "refresh_456", remember_me=True)

        calls = response.set_cookie.call_args_list
        refresh_call = calls[1]
        assert refresh_call.kwargs["key"] == REFRESH_COOKIE
        assert refresh_call.kwargs["value"] == "refresh_456"
        assert refresh_call.kwargs["httponly"] is True
        assert refresh_call.kwargs["path"] == "/api/v1/auth"

    @patch("app.core.cookies.settings")
    def test_max_age_calculation_with_remember_me(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 15
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 30
        mock_settings.COOKIE_SECURE = False
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=True)

        calls = response.set_cookie.call_args_list
        assert calls[0].kwargs["max_age"] == 15 * 60  # 900 seconds
        assert calls[1].kwargs["max_age"] == 30 * 86400  # 30 days in seconds

    @patch("app.core.cookies.settings")
    def test_no_max_age_without_remember_me(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 15
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 30
        mock_settings.COOKIE_SECURE = False
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=False)

        calls = response.set_cookie.call_args_list
        for call in calls:
            assert "max_age" not in call.kwargs

    @patch("app.core.cookies.settings")
    def test_domain_set_when_configured(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = "example.com"

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=True)

        calls = response.set_cookie.call_args_list
        assert calls[0].kwargs["domain"] == "example.com"
        assert calls[1].kwargs["domain"] == "example.com"
        assert calls[2].kwargs["domain"] == "example.com"


class TestClearAuthCookies:
    """clear_auth_cookies removes all auth cookies."""

    @patch("app.core.cookies.settings")
    def test_deletes_all_cookies(self, mock_settings):
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        clear_auth_cookies(response)

        calls = response.delete_cookie.call_args_list
        assert len(calls) == 3

        keys = [c.kwargs["key"] for c in calls]
        assert ACCESS_COOKIE in keys
        assert REFRESH_COOKIE in keys
        assert PERSIST_COOKIE in keys

    @patch("app.core.cookies.settings")
    def test_uses_correct_paths(self, mock_settings):
        mock_settings.COOKIE_SECURE = False
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        clear_auth_cookies(response)

        calls = response.delete_cookie.call_args_list
        paths = [c.kwargs["path"] for c in calls]
        assert "/" in paths
        assert "/api/v1/auth" in paths


class TestCookieConstants:
    """Cookie name constants."""

    def test_access_cookie_name(self):
        assert ACCESS_COOKIE == "gymflow_access"

    def test_refresh_cookie_name(self):
        assert REFRESH_COOKIE == "gymflow_refresh"
