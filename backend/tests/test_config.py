"""
Tests for app.core.config — Settings validation and properties.

Coverage:
1. cors_origins_list parsing
2. is_production / is_development properties
3. allowed_hosts_list parsing
4. validate_for_startup — production errors and warnings
5. APP_ENV normalization
"""

import pytest
from unittest.mock import patch  # noqa: F401

from app.core.config import Settings


class TestSettingsProperties:
    """Settings property accessors."""

    def test_cors_origins_list_parses_csv(self):
        s = Settings(CORS_ORIGINS="http://a.com, http://b.com , http://c.com")
        assert s.cors_origins_list == ["http://a.com", "http://b.com", "http://c.com"]

    def test_cors_origins_list_empty(self):
        s = Settings(CORS_ORIGINS="")
        assert s.cors_origins_list == []

    def test_cors_origins_list_single(self):
        s = Settings(CORS_ORIGINS="http://localhost:3000")
        assert s.cors_origins_list == ["http://localhost:3000"]

    def test_is_production_true(self):
        s = Settings(APP_ENV="production")
        assert s.is_production is True
        assert s.is_development is False

    def test_is_development_true(self):
        s = Settings(APP_ENV="development")
        assert s.is_development is True
        assert s.is_production is False

    def test_allowed_hosts_list(self):
        s = Settings(ALLOWED_HOSTS="api.gym.com, www.gym.com")
        assert s.allowed_hosts_list == ["api.gym.com", "www.gym.com"]

    def test_allowed_hosts_wildcard(self):
        s = Settings(ALLOWED_HOSTS="*")
        assert s.allowed_hosts_list == ["*"]


class TestAppEnvNormalization:
    """APP_ENV field validator normalizes input."""

    def test_uppercase_normalized(self):
        s = Settings(APP_ENV="PRODUCTION")
        assert s.APP_ENV == "production"

    def test_whitespace_stripped(self):
        s = Settings(APP_ENV="  staging  ")
        assert s.APP_ENV == "staging"

    def test_mixed_case(self):
        s = Settings(APP_ENV="Development")
        assert s.APP_ENV == "development"


class TestValidateForStartup:
    """Production configuration validation."""

    def test_production_insecure_jwt_secret_fails(self):
        """Production with default JWT secret should sys.exit."""
        s = Settings(
            APP_ENV="production",
            JWT_SECRET_KEY="change-me",
            DEBUG=False,
            COOKIE_SECURE=True,
            RAZORPAY_KEY_ID="rzp_live_xxx",
        )
        with pytest.raises(SystemExit):
            s.validate_for_startup()

    def test_production_debug_true_fails(self):
        """DEBUG=true in production should sys.exit."""
        s = Settings(
            APP_ENV="production",
            JWT_SECRET_KEY="a-very-long-secure-random-secret-key-here-64chars-minimum-ok-fine",
            DEBUG=True,
            COOKIE_SECURE=True,
            RAZORPAY_KEY_ID="rzp_live_xxx",
        )
        with pytest.raises(SystemExit):
            s.validate_for_startup()

    def test_production_cookie_insecure_fails(self):
        """COOKIE_SECURE=false in production should sys.exit."""
        s = Settings(
            APP_ENV="production",
            JWT_SECRET_KEY="a-very-long-secure-random-secret-key-here-64chars-minimum-ok-fine",
            DEBUG=False,
            COOKIE_SECURE=False,
            RAZORPAY_KEY_ID="rzp_live_xxx",
        )
        with pytest.raises(SystemExit):
            s.validate_for_startup()

    def test_production_mock_razorpay_fails(self):
        """Production with mock Razorpay key should sys.exit."""
        s = Settings(
            APP_ENV="production",
            JWT_SECRET_KEY="a-very-long-secure-random-secret-key-here-64chars-minimum-ok-fine",
            DEBUG=False,
            COOKIE_SECURE=True,
            RAZORPAY_KEY_ID="mock",
        )
        with pytest.raises(SystemExit):
            s.validate_for_startup()

    def test_development_permissive(self):
        """Development mode allows insecure defaults."""
        s = Settings(
            APP_ENV="development",
            JWT_SECRET_KEY="change-me",
            DEBUG=True,
            COOKIE_SECURE=False,
        )
        # Should NOT raise
        s.validate_for_startup()

    def test_staging_warns_but_boots(self):
        """Staging warns on insecure secrets but doesn't exit."""
        s = Settings(
            APP_ENV="staging",
            JWT_SECRET_KEY="change-me",
            DEBUG=False,
            COOKIE_SECURE=True,
            RAZORPAY_KEY_ID="rzp_test_xxx",
        )
        # Should NOT raise (just warnings)
        s.validate_for_startup()

    def test_production_valid_config_passes(self):
        """Fully valid production config passes validation."""
        s = Settings(
            APP_ENV="production",
            JWT_SECRET_KEY="a-very-long-secure-random-secret-key-here-64chars-minimum-ok-fine",
            DEBUG=False,
            COOKIE_SECURE=True,
            RAZORPAY_KEY_ID="rzp_live_actual_key",
            RAZORPAY_WEBHOOK_SECRET="webhook_secret_123",
            TRUST_PROXY_HEADERS=True,
        )
        # Should NOT raise
        s.validate_for_startup()
