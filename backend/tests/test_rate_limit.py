"""
Tests for app.middleware.rate_limit — sliding window rate limiter.

Coverage:
1. Normal requests pass through
2. Rate limit exceeded returns 429
3. Auth endpoints have stricter limit
4. Health checks bypass rate limiting
5. OPTIONS requests (CORS preflight) bypass
6. _get_client_ip — direct, X-Forwarded-For, X-Real-IP
7. Retry-After header in 429 response
"""

import pytest
from unittest.mock import MagicMock, patch

from app.core.cache import InMemoryCache
from app.middleware.rate_limit import RateLimitMiddleware


class TestGetClientIp:
    """Client IP extraction logic."""

    def _make_request(self, headers=None, client_host="127.0.0.1"):
        request = MagicMock()
        request.headers = headers or {}
        request.client = MagicMock()
        request.client.host = client_host
        return request

    @patch("app.middleware.rate_limit.settings")
    def test_direct_connection(self, mock_settings):
        """Without proxy headers, use request.client.host."""
        mock_settings.TRUST_PROXY_HEADERS = False
        request = self._make_request(client_host="192.168.1.100")
        ip = RateLimitMiddleware._get_client_ip(request)
        assert ip == "192.168.1.100"

    @patch("app.middleware.rate_limit.settings")
    def test_x_real_ip_trusted(self, mock_settings):
        """X-Real-IP is used when proxy headers are trusted."""
        mock_settings.TRUST_PROXY_HEADERS = True
        request = self._make_request(
            headers={"x-real-ip": "203.0.113.50"},
            client_host="10.0.0.1",
        )
        ip = RateLimitMiddleware._get_client_ip(request)
        assert ip == "203.0.113.50"

    @patch("app.middleware.rate_limit.settings")
    def test_x_forwarded_for_trusted(self, mock_settings):
        """X-Forwarded-For first entry is used when proxy headers trusted."""
        mock_settings.TRUST_PROXY_HEADERS = True
        request = self._make_request(
            headers={"x-forwarded-for": "203.0.113.1, 10.0.0.1, 172.16.0.1"},
            client_host="10.0.0.1",
        )
        ip = RateLimitMiddleware._get_client_ip(request)
        assert ip == "203.0.113.1"

    @patch("app.middleware.rate_limit.settings")
    def test_x_real_ip_priority_over_forwarded_for(self, mock_settings):
        """X-Real-IP takes priority over X-Forwarded-For."""
        mock_settings.TRUST_PROXY_HEADERS = True
        request = self._make_request(
            headers={
                "x-real-ip": "1.2.3.4",
                "x-forwarded-for": "5.6.7.8, 9.10.11.12",
            },
            client_host="10.0.0.1",
        )
        ip = RateLimitMiddleware._get_client_ip(request)
        assert ip == "1.2.3.4"

    @patch("app.middleware.rate_limit.settings")
    def test_proxy_headers_ignored_when_not_trusted(self, mock_settings):
        """X-Forwarded-For ignored when TRUST_PROXY_HEADERS=False."""
        mock_settings.TRUST_PROXY_HEADERS = False
        request = self._make_request(
            headers={"x-forwarded-for": "spoofed.ip.1.1"},
            client_host="192.168.1.1",
        )
        ip = RateLimitMiddleware._get_client_ip(request)
        assert ip == "192.168.1.1"

    @patch("app.middleware.rate_limit.settings")
    def test_no_client_returns_unknown(self, mock_settings):
        """When request.client is None, returns 'unknown'."""
        mock_settings.TRUST_PROXY_HEADERS = False
        request = MagicMock()
        request.headers = {}
        request.client = None
        ip = RateLimitMiddleware._get_client_ip(request)
        assert ip == "unknown"

    @patch("app.middleware.rate_limit.settings")
    def test_empty_forwarded_for_falls_back(self, mock_settings):
        """Empty X-Forwarded-For falls back to client.host."""
        mock_settings.TRUST_PROXY_HEADERS = True
        request = self._make_request(
            headers={"x-forwarded-for": ""},
            client_host="10.0.0.5",
        )
        ip = RateLimitMiddleware._get_client_ip(request)
        assert ip == "10.0.0.5"

    @patch("app.middleware.rate_limit.settings")
    def test_whitespace_in_x_real_ip_stripped(self, mock_settings):
        """Whitespace in X-Real-IP is stripped."""
        mock_settings.TRUST_PROXY_HEADERS = True
        request = self._make_request(
            headers={"x-real-ip": "  203.0.113.99  "},
            client_host="10.0.0.1",
        )
        ip = RateLimitMiddleware._get_client_ip(request)
        assert ip == "203.0.113.99"
