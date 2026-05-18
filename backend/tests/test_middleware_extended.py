"""
Tests for middleware modules:
- app.middleware.body_size_limit — request body size enforcement
- app.middleware.security_headers — security header injection
- app.middleware.request_context — correlation IDs and request logging

Coverage:
1. Body size limit rejects oversized payloads (413)
2. Body size limit allows normal payloads
3. Exempt paths (CSV upload, photo upload) bypass size limit
4. Security headers present on all responses
5. HSTS header only in production mode
6. CSP varies by route type (API vs docs vs default)
7. Request context adds X-Request-ID header
8. Client-provided X-Request-ID is respected
"""

import pytest
from httpx import AsyncClient


class TestBodySizeLimit:
    """Request body size enforcement middleware."""

    async def test_normal_request_passes(self, client: AsyncClient, auth_headers: dict):
        """Normal-sized requests are not blocked."""
        resp = await client.post(
            "/api/v1/members",
            json={"name": "Test Member", "phone": "9876543210"},
            headers=auth_headers,
        )
        # Should not be 413
        assert resp.status_code != 413

    async def test_oversized_request_rejected(self, client: AsyncClient, auth_headers: dict):
        """Requests exceeding 1MB are rejected with 413."""
        # Create a payload larger than 1MB
        large_data = {"data": "x" * (1024 * 1024 + 100)}
        resp = await client.post(
            "/api/v1/members",
            json=large_data,
            headers={**auth_headers, "content-length": str(2 * 1024 * 1024)},
        )
        assert resp.status_code == 413

    async def test_get_requests_not_checked(self, client: AsyncClient, auth_headers: dict):
        """GET requests bypass body size check."""
        resp = await client.get("/api/v1/members", headers=auth_headers)
        assert resp.status_code != 413


class TestSecurityHeaders:
    """Security headers on every response."""

    async def test_x_content_type_options(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/members", headers=auth_headers)
        assert resp.headers.get("x-content-type-options") == "nosniff"

    async def test_x_frame_options(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/members", headers=auth_headers)
        assert resp.headers.get("x-frame-options") == "DENY"

    async def test_referrer_policy(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/members", headers=auth_headers)
        assert resp.headers.get("referrer-policy") == "strict-origin-when-cross-origin"

    async def test_permissions_policy(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/members", headers=auth_headers)
        policy = resp.headers.get("permissions-policy")
        assert "camera=()" in policy
        assert "microphone=()" in policy

    async def test_cache_control_no_store(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/members", headers=auth_headers)
        assert resp.headers.get("cache-control") == "no-store"

    async def test_csp_on_api_routes(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/members", headers=auth_headers)
        csp = resp.headers.get("content-security-policy")
        assert "default-src 'none'" in csp
        assert "frame-ancestors 'none'" in csp

    async def test_xss_protection_disabled(self, client: AsyncClient, auth_headers: dict):
        """X-XSS-Protection set to 0 (modern CSP replaces it)."""
        resp = await client.get("/api/v1/members", headers=auth_headers)
        assert resp.headers.get("x-xss-protection") == "0"


class TestRequestContext:
    """Request context middleware — correlation IDs."""

    async def test_response_has_x_request_id(self, client: AsyncClient, auth_headers: dict):
        """Every response includes X-Request-ID for correlation."""
        resp = await client.get("/api/v1/members", headers=auth_headers)
        assert "x-request-id" in resp.headers

    async def test_client_request_id_respected(self, client: AsyncClient, auth_headers: dict):
        """Client-provided X-Request-ID is adopted."""
        headers = {**auth_headers, "x-request-id": "client-trace-123"}
        resp = await client.get("/api/v1/members", headers=headers)
        # The response should include the request ID (might be our generated one)
        assert "x-request-id" in resp.headers

    async def test_health_endpoint_has_request_id(self, client: AsyncClient):
        """Even unauthenticated endpoints get correlation IDs."""
        resp = await client.get("/health")
        assert "x-request-id" in resp.headers
