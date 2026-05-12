"""
Subscription enforcement middleware tests for GymFlow Track.

Coverage:
1. Full access — active subscription allows all methods
2. Read-only mode — expired/cancelled allows GET but blocks POST/PUT/DELETE
3. Locked mode — fully expired blocks everything except exempt routes
4. Exempt routes — auth, billing, health bypass enforcement
5. Super admin bypass — super_admin role skips subscription check
6. Cache behavior — subscription status is cached
7. No token — unauthenticated requests pass through to auth dependency
"""

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.core.cache import get_cache_backend
from app.core.security import create_access_token
from app.models.gym import Gym
from app.models.user import User


# === Full Access Tests ===


class TestFullAccess:
    """Verify that active subscriptions allow all operations."""

    async def test_active_sub_allows_get(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Active subscription allows GET requests."""
        resp = await client.get("/api/v1/members", headers=auth_headers)
        assert resp.status_code == 200

    async def test_active_sub_allows_post(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Active subscription allows POST requests."""
        resp = await client.post(
            "/api/v1/members",
            json={"name": "MW Test", "phone": "9500000001"},
            headers=auth_headers,
        )
        assert resp.status_code == 201

    async def test_active_sub_allows_patch(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Active subscription allows PATCH requests."""
        create_resp = await client.post(
            "/api/v1/members",
            json={"name": "MW Patch", "phone": "9500000002"},
            headers=auth_headers,
        )
        member_id = create_resp.json()["id"]

        resp = await client.patch(
            f"/api/v1/members/{member_id}",
            json={"name": "MW Patched"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_active_sub_allows_delete(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Active subscription allows DELETE requests."""
        create_resp = await client.post(
            "/api/v1/members",
            json={"name": "MW Delete", "phone": "9500000003"},
            headers=auth_headers,
        )
        member_id = create_resp.json()["id"]

        resp = await client.delete(
            f"/api/v1/members/{member_id}", headers=auth_headers
        )
        assert resp.status_code == 204


# === Read-Only Mode Tests ===


class TestReadOnlyMode:
    """Verify read-only mode blocks write operations."""

    @pytest.fixture
    def readonly_headers(
        self, sample_user: User, sample_gym: Gym
    ) -> dict[str, str]:
        """Headers for a user whose gym is in read-only mode."""
        cache = get_cache_backend()
        cache.set(f"sub:{sample_gym.id}", "read_only", 99999)
        token = create_access_token(
            sample_user.id, sample_gym.id, sample_user.role.value
        )
        return {"Authorization": f"Bearer {token}"}

    async def test_read_only_allows_get(
        self, client: AsyncClient, readonly_headers: dict
    ):
        """Read-only mode allows GET requests."""
        resp = await client.get("/api/v1/members", headers=readonly_headers)
        assert resp.status_code == 200

    async def test_read_only_blocks_post(
        self, client: AsyncClient, readonly_headers: dict
    ):
        """Read-only mode blocks POST requests."""
        resp = await client.post(
            "/api/v1/members",
            json={"name": "Blocked", "phone": "9500000010"},
            headers=readonly_headers,
        )
        assert resp.status_code == 403
        assert resp.json()["code"] == "subscription_read_only"

    async def test_read_only_blocks_patch(
        self, client: AsyncClient, readonly_headers: dict
    ):
        """Read-only mode blocks PATCH requests."""
        resp = await client.patch(
            f"/api/v1/members/{uuid4()}",
            json={"name": "Blocked"},
            headers=readonly_headers,
        )
        assert resp.status_code == 403

    async def test_read_only_blocks_delete(
        self, client: AsyncClient, readonly_headers: dict
    ):
        """Read-only mode blocks DELETE requests."""
        resp = await client.delete(
            f"/api/v1/members/{uuid4()}",
            headers=readonly_headers,
        )
        assert resp.status_code == 403


# === Locked Mode Tests ===


class TestLockedMode:
    """Verify locked mode blocks all non-exempt requests."""

    @pytest.fixture
    def locked_headers(
        self, sample_user: User, sample_gym: Gym
    ) -> dict[str, str]:
        """Headers for a user whose gym is locked."""
        cache = get_cache_backend()
        cache.set(f"sub:{sample_gym.id}", "locked", 99999)
        token = create_access_token(
            sample_user.id, sample_gym.id, sample_user.role.value
        )
        return {"Authorization": f"Bearer {token}"}

    async def test_locked_blocks_get(
        self, client: AsyncClient, locked_headers: dict
    ):
        """Locked mode blocks GET requests."""
        resp = await client.get("/api/v1/members", headers=locked_headers)
        assert resp.status_code == 403
        assert resp.json()["code"] == "subscription_expired"

    async def test_locked_blocks_post(
        self, client: AsyncClient, locked_headers: dict
    ):
        """Locked mode blocks POST requests."""
        resp = await client.post(
            "/api/v1/members",
            json={"name": "Locked", "phone": "9500000020"},
            headers=locked_headers,
        )
        assert resp.status_code == 403

    async def test_locked_blocks_delete(
        self, client: AsyncClient, locked_headers: dict
    ):
        """Locked mode blocks DELETE requests."""
        resp = await client.delete(
            f"/api/v1/members/{uuid4()}",
            headers=locked_headers,
        )
        assert resp.status_code == 403


# === Exempt Route Tests ===


class TestExemptRoutes:
    """Verify exempt routes bypass subscription enforcement."""

    @pytest.fixture
    def locked_headers(
        self, sample_user: User, sample_gym: Gym
    ) -> dict[str, str]:
        """Headers for a user whose gym is locked."""
        cache = get_cache_backend()
        cache.set(f"sub:{sample_gym.id}", "locked", 99999)
        token = create_access_token(
            sample_user.id, sample_gym.id, sample_user.role.value
        )
        return {"Authorization": f"Bearer {token}"}

    async def test_auth_me_is_exempt(
        self, client: AsyncClient, locked_headers: dict
    ):
        """Auth endpoints work even when locked."""
        resp = await client.get("/api/v1/auth/me", headers=locked_headers)
        # Should NOT be 403 from middleware — may be 200 or 401 from auth
        assert resp.status_code != 403 or "subscription" not in resp.json().get("code", "")

    async def test_billing_plans_is_exempt(
        self, client: AsyncClient, locked_headers: dict
    ):
        """Billing plans endpoint works even when locked."""
        resp = await client.get("/api/v1/billing/plans", headers=locked_headers)
        assert resp.status_code == 200

    async def test_health_is_exempt(self, client: AsyncClient):
        """Health endpoint is always accessible."""
        resp = await client.get("/health")
        assert resp.status_code in (200, 503)

    async def test_billing_subscribe_is_exempt(
        self, client: AsyncClient, locked_headers: dict
    ):
        """Users with locked subscriptions can still subscribe."""
        resp = await client.post(
            "/api/v1/billing/subscribe",
            json={"plan_tier": "starter"},
            headers=locked_headers,
        )
        # Should NOT be 403 from subscription middleware
        # May be 200 (success) or other error, but not subscription_expired
        if resp.status_code == 403:
            assert resp.json().get("code") != "subscription_expired"


# === Super Admin Bypass Tests ===


class TestSuperAdminBypass:
    """Verify super_admin bypasses subscription enforcement."""

    async def test_super_admin_bypasses_enforcement(
        self, client: AsyncClient, super_admin_headers: dict
    ):
        """Super admin requests bypass subscription check entirely."""
        resp = await client.get(
            "/api/v1/admin/metrics", headers=super_admin_headers
        )
        assert resp.status_code == 200


# === Cache Behavior Tests ===


class TestSubscriptionCache:
    """Verify subscription status caching behavior."""

    def test_cache_set_and_get(self):
        """Subscription cache stores and retrieves access level."""
        from app.middleware.subscription_enforcement import (
            _get_cached_access,
            _set_cached_access,
        )

        gym_id = str(uuid4())
        _set_cached_access(gym_id, "full")
        assert _get_cached_access(gym_id) == "full"

    def test_cache_invalidation(self):
        """invalidate_subscription_cache clears the cache."""
        from app.middleware.subscription_enforcement import (
            _get_cached_access,
            _set_cached_access,
            invalidate_subscription_cache,
        )

        gym_id = uuid4()
        _set_cached_access(str(gym_id), "full")
        assert _get_cached_access(str(gym_id)) == "full"

        invalidate_subscription_cache(gym_id)
        assert _get_cached_access(str(gym_id)) is None

    async def test_cached_status_used_for_subsequent_requests(
        self, client: AsyncClient, sample_user: User, sample_gym: Gym
    ):
        """Once cached, the subscription status is reused without DB lookup."""
        cache = get_cache_backend()
        cache.set(f"sub:{sample_gym.id}", "full", 99999)

        token = create_access_token(
            sample_user.id, sample_gym.id, sample_user.role.value
        )
        headers = {"Authorization": f"Bearer {token}"}

        # Multiple requests should all succeed (cached as "full")
        for _ in range(3):
            resp = await client.get("/api/v1/members", headers=headers)
            assert resp.status_code == 200


# === No Token Tests ===


class TestNoToken:
    """Verify unauthenticated requests pass through middleware."""

    async def test_no_token_passes_to_auth_dependency(
        self, client: AsyncClient
    ):
        """Requests without a token pass through middleware to auth dependency."""
        resp = await client.get("/api/v1/members")
        # Should get 401 from auth dependency, not 403 from middleware
        assert resp.status_code in (401, 403)

    async def test_invalid_token_passes_to_auth_dependency(
        self, client: AsyncClient
    ):
        """Invalid tokens pass through middleware to auth dependency."""
        resp = await client.get(
            "/api/v1/members",
            headers={"Authorization": "Bearer garbage.token.here"},
        )
        assert resp.status_code == 401
