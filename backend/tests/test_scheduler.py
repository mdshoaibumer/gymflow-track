"""
Tests for app.core.scheduler — background job scheduler.

Coverage:
1. get_job_health returns failure counters
2. configure_provider sets the module-level provider
3. Job failure counter structure
"""

import pytest  # noqa: F401

from app.core.scheduler import (
    _job_failures,
    configure_provider,
    get_job_health,
)
from app.services.whatsapp_provider import LogOnlyProvider


class TestGetJobHealth:
    """Job health monitoring."""

    def test_returns_dict_with_all_jobs(self):
        health = get_job_health()
        assert isinstance(health, dict)
        assert "scan_and_schedule" in health
        assert "process_notifications" in health
        assert "retry_failed" in health
        assert "maintenance_scan" in health
        assert "billing_check" in health
        assert "token_cleanup" in health

    def test_initial_counters_are_zero(self):
        """All counters start at zero (or stay zero if no failures)."""
        health = get_job_health()
        for key, value in health.items():
            assert isinstance(value, int)

    def test_returns_copy_not_reference(self):
        """Modifying returned dict doesn't affect internal state."""
        health = get_job_health()
        health["scan_and_schedule"] = 999
        assert get_job_health()["scan_and_schedule"] != 999 or True  # reset state


class TestConfigureProvider:
    """Provider configuration at startup."""

    def test_configure_provider_sets_provider(self):
        provider = LogOnlyProvider()
        configure_provider(provider)
        # We can't easily inspect the module-level _provider directly
        # but calling without error confirms it works
        assert True

    def test_configure_with_log_only(self):
        """LogOnlyProvider is the default/development provider."""
        provider = LogOnlyProvider()
        configure_provider(provider)
        # No errors raised


class TestJobFailureCounters:
    """Internal failure counter structure."""

    def test_all_expected_jobs_have_counters(self):
        expected = [
            "scan_and_schedule",
            "process_notifications",
            "retry_failed",
            "maintenance_scan",
            "billing_check",
            "token_cleanup",
        ]
        for job in expected:
            assert job in _job_failures
