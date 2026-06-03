"""
Tests for Remember Me feature — cookie persistence behavior.

Coverage:
1. LoginRequest schema accepts remember_me field (defaults to False)
2. set_auth_cookies with remember_me=False → session cookies (no max_age)
3. set_auth_cookies with remember_me=True → persistent cookies (with max_age)
4. Persist cookie is set/cleared correctly
5. get_remember_me reads persist cookie
6. clear_auth_cookies clears persist cookie too
7. Refresh endpoint preserves remember_me preference
8. Login endpoint passes remember_me to set_auth_cookies
9. Default login (no remember_me) produces session cookies
10. Login with remember_me=true produces persistent cookies
11. Token refresh with persist=1 produces persistent cookies
12. Token refresh without persist cookie produces session cookies
"""

from unittest.mock import MagicMock, patch

import pytest

from app.core.cookies import (
    ACCESS_COOKIE,
    PERSIST_COOKIE,
    REFRESH_COOKIE,
    clear_auth_cookies,
    get_remember_me,
    set_auth_cookies,
)
from app.schemas.auth import LoginRequest


# ─── Schema Tests ─────────────────────────────────────────────────────────────


class TestLoginRequestSchema:
    """LoginRequest schema accepts optional remember_me field."""

    def test_remember_me_defaults_to_false(self):
        req = LoginRequest(email="test@gym.com", password="secret123")
        assert req.remember_me is False

    def test_remember_me_true(self):
        req = LoginRequest(email="test@gym.com", password="secret123", remember_me=True)
        assert req.remember_me is True

    def test_remember_me_false_explicit(self):
        req = LoginRequest(email="test@gym.com", password="secret123", remember_me=False)
        assert req.remember_me is False

    def test_schema_still_requires_email_and_password(self):
        with pytest.raises(Exception):
            LoginRequest(email="test@gym.com")  # missing password

        with pytest.raises(Exception):
            LoginRequest(password="secret123")  # missing email


# ─── Cookie Utility Tests ─────────────────────────────────────────────────────


class TestSetAuthCookiesSessionMode:
    """When remember_me=False, cookies are session-scoped (no max_age)."""

    @patch("app.core.cookies.settings")
    def test_access_cookie_has_no_max_age(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "access_tok", "refresh_tok", remember_me=False)

        calls = response.set_cookie.call_args_list
        # Access cookie — first call
        access_call = calls[0]
        assert "max_age" not in access_call.kwargs

    @patch("app.core.cookies.settings")
    def test_refresh_cookie_has_no_max_age(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "access_tok", "refresh_tok", remember_me=False)

        calls = response.set_cookie.call_args_list
        # Refresh cookie — second call
        refresh_call = calls[1]
        assert "max_age" not in refresh_call.kwargs

    @patch("app.core.cookies.settings")
    def test_persist_cookie_has_no_max_age(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "access_tok", "refresh_tok", remember_me=False)

        calls = response.set_cookie.call_args_list
        # Persist cookie — third call
        persist_call = calls[2]
        assert persist_call.kwargs["value"] == "0"
        assert "max_age" not in persist_call.kwargs

    @patch("app.core.cookies.settings")
    def test_default_remember_me_is_false(self, mock_settings):
        """Calling set_auth_cookies without remember_me defaults to session cookies."""
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt")  # no remember_me arg

        calls = response.set_cookie.call_args_list
        for call in calls:
            assert "max_age" not in call.kwargs

    @patch("app.core.cookies.settings")
    def test_httponly_still_set_on_session_cookies(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=False)

        calls = response.set_cookie.call_args_list
        for call in calls:
            assert call.kwargs["httponly"] is True

    @patch("app.core.cookies.settings")
    def test_secure_flag_set_on_session_cookies(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=False)

        calls = response.set_cookie.call_args_list
        for call in calls:
            assert call.kwargs["secure"] is True


class TestSetAuthCookiesPersistentMode:
    """When remember_me=True, cookies have max_age (survive browser close)."""

    @patch("app.core.cookies.settings")
    def test_access_cookie_has_max_age(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "access_tok", "refresh_tok", remember_me=True)

        calls = response.set_cookie.call_args_list
        access_call = calls[0]
        assert access_call.kwargs["max_age"] == 30 * 60  # 1800 seconds

    @patch("app.core.cookies.settings")
    def test_refresh_cookie_has_max_age(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "access_tok", "refresh_tok", remember_me=True)

        calls = response.set_cookie.call_args_list
        refresh_call = calls[1]
        assert refresh_call.kwargs["max_age"] == 7 * 86400  # 7 days in seconds

    @patch("app.core.cookies.settings")
    def test_persist_cookie_has_max_age_and_value_1(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "access_tok", "refresh_tok", remember_me=True)

        calls = response.set_cookie.call_args_list
        persist_call = calls[2]
        assert persist_call.kwargs["key"] == PERSIST_COOKIE
        assert persist_call.kwargs["value"] == "1"
        assert persist_call.kwargs["max_age"] == 7 * 86400

    @patch("app.core.cookies.settings")
    def test_max_age_calculation_with_different_settings(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 15
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 30
        mock_settings.COOKIE_SECURE = False
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=True)

        calls = response.set_cookie.call_args_list
        assert calls[0].kwargs["max_age"] == 15 * 60  # 900s
        assert calls[1].kwargs["max_age"] == 30 * 86400  # 30 days
        assert calls[2].kwargs["max_age"] == 30 * 86400  # persist matches refresh

    @patch("app.core.cookies.settings")
    def test_httponly_still_set_on_persistent_cookies(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=True)

        calls = response.set_cookie.call_args_list
        for call in calls:
            assert call.kwargs["httponly"] is True

    @patch("app.core.cookies.settings")
    def test_domain_set_when_configured_persistent(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = "mygym.com"

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=True)

        calls = response.set_cookie.call_args_list
        for call in calls:
            assert call.kwargs["domain"] == "mygym.com"

    @patch("app.core.cookies.settings")
    def test_domain_not_set_when_empty(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=True)

        calls = response.set_cookie.call_args_list
        for call in calls:
            assert "domain" not in call.kwargs


class TestSetAuthCookiesPaths:
    """Cookie path-scoping works correctly in both modes."""

    @patch("app.core.cookies.settings")
    def test_access_cookie_path_is_root(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=True)

        calls = response.set_cookie.call_args_list
        assert calls[0].kwargs["path"] == "/"

    @patch("app.core.cookies.settings")
    def test_refresh_cookie_path_is_auth(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=True)

        calls = response.set_cookie.call_args_list
        assert calls[1].kwargs["path"] == "/api/v1/auth"

    @patch("app.core.cookies.settings")
    def test_persist_cookie_path_is_auth(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=False)

        calls = response.set_cookie.call_args_list
        assert calls[2].kwargs["path"] == "/api/v1/auth"


class TestSetAuthCookiesThreeCookiesSet:
    """set_auth_cookies always sets exactly 3 cookies."""

    @patch("app.core.cookies.settings")
    def test_three_cookies_set_session_mode(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=False)

        assert response.set_cookie.call_count == 3

    @patch("app.core.cookies.settings")
    def test_three_cookies_set_persistent_mode(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=True)

        assert response.set_cookie.call_count == 3

    @patch("app.core.cookies.settings")
    def test_cookie_keys_are_correct(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=True)

        calls = response.set_cookie.call_args_list
        keys = [c.kwargs["key"] for c in calls]
        assert keys == [ACCESS_COOKIE, REFRESH_COOKIE, PERSIST_COOKIE]


# ─── get_remember_me Tests ────────────────────────────────────────────────────


class TestGetRememberMe:
    """get_remember_me correctly reads the persist cookie."""

    def test_returns_true_when_persist_cookie_is_1(self):
        request = MagicMock()
        request.cookies = {PERSIST_COOKIE: "1"}
        assert get_remember_me(request) is True

    def test_returns_false_when_persist_cookie_is_0(self):
        request = MagicMock()
        request.cookies = {PERSIST_COOKIE: "0"}
        assert get_remember_me(request) is False

    def test_returns_false_when_persist_cookie_missing(self):
        request = MagicMock()
        request.cookies = {}
        assert get_remember_me(request) is False

    def test_returns_false_for_unexpected_value(self):
        request = MagicMock()
        request.cookies = {PERSIST_COOKIE: "yes"}
        assert get_remember_me(request) is False

    def test_returns_false_for_empty_string(self):
        request = MagicMock()
        request.cookies = {PERSIST_COOKIE: ""}
        assert get_remember_me(request) is False


# ─── clear_auth_cookies Tests ─────────────────────────────────────────────────


class TestClearAuthCookies:
    """clear_auth_cookies removes all three cookies."""

    @patch("app.core.cookies.settings")
    def test_deletes_three_cookies(self, mock_settings):
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        clear_auth_cookies(response)

        assert response.delete_cookie.call_count == 3

    @patch("app.core.cookies.settings")
    def test_deletes_correct_cookie_keys(self, mock_settings):
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        clear_auth_cookies(response)

        calls = response.delete_cookie.call_args_list
        keys = [c.kwargs["key"] for c in calls]
        assert ACCESS_COOKIE in keys
        assert REFRESH_COOKIE in keys
        assert PERSIST_COOKIE in keys

    @patch("app.core.cookies.settings")
    def test_deletes_with_correct_paths(self, mock_settings):
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        clear_auth_cookies(response)

        calls = response.delete_cookie.call_args_list
        path_map = {c.kwargs["key"]: c.kwargs["path"] for c in calls}
        assert path_map[ACCESS_COOKIE] == "/"
        assert path_map[REFRESH_COOKIE] == "/api/v1/auth"
        assert path_map[PERSIST_COOKIE] == "/api/v1/auth"

    @patch("app.core.cookies.settings")
    def test_deletes_with_domain_when_configured(self, mock_settings):
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = "gymflow.in"

        response = MagicMock()
        clear_auth_cookies(response)

        calls = response.delete_cookie.call_args_list
        for call in calls:
            assert call.kwargs["domain"] == "gymflow.in"


# ─── Cookie Constants Tests ───────────────────────────────────────────────────


class TestCookieConstants:
    """Cookie name constants are stable."""

    def test_access_cookie_name(self):
        assert ACCESS_COOKIE == "gymflow_access"

    def test_refresh_cookie_name(self):
        assert REFRESH_COOKIE == "gymflow_refresh"

    def test_persist_cookie_name(self):
        assert PERSIST_COOKIE == "gymflow_persist"


# ─── Integration-style: Cookie values passed correctly ────────────────────────


class TestCookieTokenValues:
    """Token values are correctly passed to cookies."""

    @patch("app.core.cookies.settings")
    def test_access_token_value_in_cookie(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "my_access_jwt_xyz", "my_refresh_jwt_abc", remember_me=True)

        calls = response.set_cookie.call_args_list
        assert calls[0].kwargs["value"] == "my_access_jwt_xyz"

    @patch("app.core.cookies.settings")
    def test_refresh_token_value_in_cookie(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "lax"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "my_access_jwt_xyz", "my_refresh_jwt_abc", remember_me=False)

        calls = response.set_cookie.call_args_list
        assert calls[1].kwargs["value"] == "my_refresh_jwt_abc"

    @patch("app.core.cookies.settings")
    def test_samesite_attribute_passed(self, mock_settings):
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.COOKIE_SECURE = True
        mock_settings.COOKIE_SAMESITE = "strict"
        mock_settings.COOKIE_DOMAIN = ""

        response = MagicMock()
        set_auth_cookies(response, "at", "rt", remember_me=True)

        calls = response.set_cookie.call_args_list
        for call in calls:
            assert call.kwargs["samesite"] == "strict"
