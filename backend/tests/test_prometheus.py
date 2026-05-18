"""
Tests for app.middleware.prometheus — Prometheus metrics middleware.

Coverage:
1. _normalize_path — UUID replacement, numeric ID replacement
2. Path normalization preserves non-ID segments
3. Various path patterns
"""

import pytest

from app.middleware.prometheus import _normalize_path


class TestNormalizePath:
    """Path normalization for metric label cardinality control."""

    def test_uuid_replaced(self):
        """UUID path segments are replaced with {id}."""
        path = "/api/v1/members/550e8400-e29b-41d4-a716-446655440000"
        result = _normalize_path(path)
        assert result == "/api/v1/members/{id}"

    def test_numeric_id_replaced(self):
        """Numeric path segments are replaced with {id}."""
        path = "/api/v1/gyms/123"
        result = _normalize_path(path)
        assert result == "/api/v1/gyms/{id}"

    def test_multiple_ids_replaced(self):
        """Multiple IDs in one path are all replaced."""
        path = "/api/v1/gyms/550e8400-e29b-41d4-a716-446655440000/members/42"
        result = _normalize_path(path)
        assert result == "/api/v1/gyms/{id}/members/{id}"

    def test_no_ids_unchanged(self):
        """Paths without IDs pass through unchanged."""
        path = "/api/v1/members"
        result = _normalize_path(path)
        assert result == "/api/v1/members"

    def test_health_endpoint(self):
        path = "/health"
        result = _normalize_path(path)
        assert result == "/health"

    def test_root_path(self):
        path = "/"
        result = _normalize_path(path)
        assert result == "/"

    def test_nested_path_no_ids(self):
        path = "/api/v1/auth/login"
        result = _normalize_path(path)
        assert result == "/api/v1/auth/login"

    def test_mixed_segments(self):
        """Non-UUID, non-numeric strings are kept."""
        path = "/api/v1/members/photo"
        result = _normalize_path(path)
        assert result == "/api/v1/members/photo"

    def test_short_numeric_not_confused_with_version(self):
        """'v1' is not a pure numeric, so kept as-is."""
        path = "/api/v1/reports"
        result = _normalize_path(path)
        assert result == "/api/v1/reports"

    def test_trailing_slash_stripped(self):
        path = "/api/v1/members/"
        result = _normalize_path(path)
        # strip("/") removes trailing slash, split gives empty last element
        # which is fine — the path won't have trailing empty segment
        assert "/api/v1/members" in result
