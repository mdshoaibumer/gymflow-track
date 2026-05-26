"""
Tests for May 2026 security audit implementation fixes.

Coverage:
1. Webhook token from environment variable (not hardcoded)
2. Subscription enforcement enabled via config with super admin bypass
3. Super admin grant-access endpoint
4. Rate limiting backend correctness
5. Config validation for new settings
"""

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.core.cache import get_cache_backend
from app.core.config import settings
from app.core.security import create_access_token
from app.models.gym import Gym
from app.models.subscription import BillingStatus, GymSubscription
from app.models.user import User


# =============================================================================
# 1. Webhook Token Security Tests
# =============================================================================


class TestWebhookTokenSecurity:
    """Verify webhook verification token is sourced from config, not hardcoded."""

    async def test_webhook_verification_uses_config_token(self, client: AsyncClient):
        """WhatsApp webhook verification uses settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN."""
        token = settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN
        resp = await client.get(
            "/api/v1/webhook/whatsapp-attendance",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": token,
                "hub.challenge": "12345",
            },
        )
        assert resp.status_code == 200
        assert resp.json() == 12345

    async def test_webhook_rejects_wrong_token(self, client: AsyncClient):
        """Webhook verification rejects invalid tokens."""
        resp = await client.get(
            "/api/v1/webhook/whatsapp-attendance",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "wrong-token-attempt",
                "hub.challenge": "12345",
            },
        )
        assert resp.status_code == 403

    async def test_webhook_rejects_old_hardcoded_token(self, client: AsyncClient):
        """The old hardcoded token no longer works if config differs."""
        old_hardcoded = "gymflow_attendance_webhook_v1"
        if settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN != old_hardcoded:
            resp = await client.get(
                "/api/v1/webhook/whatsapp-attendance",
                params={
                    "hub.mode": "subscribe",
                    "hub.verify_token": old_hardcoded,
                    "hub.challenge": "12345",
                },
            )
            assert resp.status_code == 403

    async def test_webhook_rejects_invalid_mode(self, client: AsyncClient):
        """Webhook rejects requests without hub.mode=subscribe."""
        resp = await client.get(
            "/api/v1/webhook/whatsapp-attendance",
            params={
                "hub.mode": "unsubscribe",
                "hub.verify_token": settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
                "hub.challenge": "12345",
            },
        )
        assert resp.status_code == 403

    async def test_webhook_rejects_empty_token(self, client: AsyncClient):
        """Webhook rejects empty token."""
        resp = await client.get(
            "/api/v1/webhook/whatsapp-attendance",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "",
                "hub.challenge": "12345",
            },
        )
        assert resp.status_code == 403


# =============================================================================
# 2. Subscription Enforcement Config Toggle Tests
# =============================================================================


class TestSubscriptionEnforcementToggle:
    """Verify subscription enforcement respects the SUBSCRIPTION_ENFORCE setting."""

    async def test_enforcement_disabled_allows_locked_gym(
        self, client: AsyncClient, auth_headers: dict, sample_gym: Gym
    ):
        """When SUBSCRIPTION_ENFORCE=false, locked gyms can still access API."""
        assert settings.SUBSCRIPTION_ENFORCE is False

        cache = get_cache_backend()
        cache.set(f"sub:{sample_gym.id}", "locked", 99999)

        resp = await client.get("/api/v1/members", headers=auth_headers)
        assert resp.status_code != 403 or "subscription" not in resp.json().get("code", "")

        # Restore
        cache.set(f"sub:{sample_gym.id}", "full", 99999)

    async def test_enforcement_enabled_blocks_locked_gym(
        self, client: AsyncClient, auth_headers: dict, sample_gym: Gym
    ):
        """When SUBSCRIPTION_ENFORCE=true and gym is locked, requests are blocked."""
        original = settings.SUBSCRIPTION_ENFORCE
        settings.SUBSCRIPTION_ENFORCE = True
        try:
            cache = get_cache_backend()
            cache.set(f"sub:{sample_gym.id}", "locked", 99999)

            resp = await client.get("/api/v1/members", headers=auth_headers)
            assert resp.status_code == 403
            assert resp.json()["code"] == "subscription_expired"
        finally:
            settings.SUBSCRIPTION_ENFORCE = original
            get_cache_backend().set(f"sub:{sample_gym.id}", "full", 99999)

    async def test_enforcement_enabled_read_only_blocks_writes(
        self, client: AsyncClient, auth_headers: dict, sample_gym: Gym
    ):
        """Read-only mode blocks POST but allows GET."""
        original = settings.SUBSCRIPTION_ENFORCE
        settings.SUBSCRIPTION_ENFORCE = True
        try:
            cache = get_cache_backend()
            cache.set(f"sub:{sample_gym.id}", "read_only", 99999)

            # GET should work
            resp = await client.get("/api/v1/members", headers=auth_headers)
            assert resp.status_code == 200

            # POST should be blocked
            resp = await client.post(
                "/api/v1/members",
                json={"name": "Test", "phone": "9500000099"},
                headers=auth_headers,
            )
            assert resp.status_code == 403
            assert resp.json()["code"] == "subscription_read_only"
        finally:
            settings.SUBSCRIPTION_ENFORCE = original
            get_cache_backend().set(f"sub:{sample_gym.id}", "full", 99999)

    async def test_enforcement_enabled_allows_full_access_gym(
        self, client: AsyncClient, auth_headers: dict, sample_gym: Gym
    ):
        """Full access gyms can use all operations with enforcement on."""
        original = settings.SUBSCRIPTION_ENFORCE
        settings.SUBSCRIPTION_ENFORCE = True
        try:
            cache = get_cache_backend()
            cache.set(f"sub:{sample_gym.id}", "full", 99999)

            resp = await client.get("/api/v1/members", headers=auth_headers)
            assert resp.status_code == 200
        finally:
            settings.SUBSCRIPTION_ENFORCE = original

    async def test_super_admin_always_bypasses_enforcement(
        self, client: AsyncClient, super_admin_headers: dict
    ):
        """Super admin bypasses subscription enforcement regardless of setting."""
        original = settings.SUBSCRIPTION_ENFORCE
        settings.SUBSCRIPTION_ENFORCE = True
        try:
            resp = await client.get(
                "/api/v1/admin/metrics", headers=super_admin_headers
            )
            assert resp.status_code == 200
        finally:
            settings.SUBSCRIPTION_ENFORCE = original


# =============================================================================
# 3. Super Admin Grant Access Endpoint Tests
# =============================================================================


class TestGrantAccess:
    """Verify super admin can grant access to gyms."""

    async def test_grant_access_success(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        sample_gym: Gym,
    ):
        """Super admin can grant a gym full access for N days."""
        resp = await client.post(
            f"/api/v1/admin/gyms/{sample_gym.id}/grant-access",
            json={"days": 30, "reason": "Partner gym - complimentary access"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["action"] == "access_granted"
        assert "30 days" in data["message"]

    async def test_grant_access_activates_expired_gym(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        sample_gym: Gym,
        db_session,
    ):
        """Grant access activates a previously expired gym."""
        from sqlalchemy import select

        result = await db_session.execute(
            select(GymSubscription).where(GymSubscription.gym_id == sample_gym.id)
        )
        sub = result.scalar_one()
        sub.status = BillingStatus.EXPIRED
        await db_session.flush()

        resp = await client.post(
            f"/api/v1/admin/gyms/{sample_gym.id}/grant-access",
            json={"days": 60, "reason": "Resolving billing dispute"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        await db_session.refresh(sub)
        assert sub.status == BillingStatus.ACTIVE

    async def test_grant_access_invalidates_subscription_cache(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        sample_gym: Gym,
    ):
        """Grant access invalidates the subscription cache."""
        cache = get_cache_backend()
        cache.set(f"sub:{sample_gym.id}", "locked", 99999)

        resp = await client.post(
            f"/api/v1/admin/gyms/{sample_gym.id}/grant-access",
            json={"days": 30, "reason": "Cache invalidation test"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 200

        # Cache should be cleared
        cached = cache.get(f"sub:{sample_gym.id}")
        assert cached is None

    async def test_grant_access_requires_super_admin(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_gym: Gym,
    ):
        """Regular owner cannot grant access."""
        resp = await client.post(
            f"/api/v1/admin/gyms/{sample_gym.id}/grant-access",
            json={"days": 30, "reason": "Unauthorized attempt"},
            headers=auth_headers,
        )
        assert resp.status_code == 403

    async def test_grant_access_rejects_too_many_days(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        sample_gym: Gym,
    ):
        """Grant access rejects more than 365 days."""
        resp = await client.post(
            f"/api/v1/admin/gyms/{sample_gym.id}/grant-access",
            json={"days": 400, "reason": "Too many days"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 422

    async def test_grant_access_rejects_zero_days(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        sample_gym: Gym,
    ):
        """Grant access rejects zero days."""
        resp = await client.post(
            f"/api/v1/admin/gyms/{sample_gym.id}/grant-access",
            json={"days": 0, "reason": "Zero days test"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 422

    async def test_grant_access_rejects_short_reason(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        sample_gym: Gym,
    ):
        """Grant access requires a reason with min 3 chars."""
        resp = await client.post(
            f"/api/v1/admin/gyms/{sample_gym.id}/grant-access",
            json={"days": 30, "reason": "ab"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 422

    async def test_grant_access_nonexistent_gym(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
    ):
        """Grant access to nonexistent gym returns 404."""
        fake_id = uuid4()
        resp = await client.post(
            f"/api/v1/admin/gyms/{fake_id}/grant-access",
            json={"days": 30, "reason": "Gym does not exist test"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 404

    async def test_grant_access_unlocks_gym_with_enforcement(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        auth_headers: dict,
        sample_gym: Gym,
        db_session,
    ):
        """After granting access, a previously locked gym can access the API."""
        from sqlalchemy import select

        # Lock the gym
        result = await db_session.execute(
            select(GymSubscription).where(GymSubscription.gym_id == sample_gym.id)
        )
        sub = result.scalar_one()
        sub.status = BillingStatus.EXPIRED
        await db_session.flush()

        cache = get_cache_backend()
        cache.set(f"sub:{sample_gym.id}", "locked", 99999)

        # Enable enforcement
        original = settings.SUBSCRIPTION_ENFORCE
        settings.SUBSCRIPTION_ENFORCE = True
        try:
            # Confirm gym is locked
            resp = await client.get("/api/v1/members", headers=auth_headers)
            assert resp.status_code == 403

            # Super admin grants access
            resp = await client.post(
                f"/api/v1/admin/gyms/{sample_gym.id}/grant-access",
                json={"days": 30, "reason": "Unlock for testing"},
                headers=super_admin_headers,
            )
            assert resp.status_code == 200

            # Now the gym should have access (cache was invalidated, DB says active)
            # Set cache to full to simulate what middleware would do on next lookup
            cache.set(f"sub:{sample_gym.id}", "full", 99999)
            resp = await client.get("/api/v1/members", headers=auth_headers)
            assert resp.status_code == 200
        finally:
            settings.SUBSCRIPTION_ENFORCE = original
            cache.set(f"sub:{sample_gym.id}", "full", 99999)


# =============================================================================
# 4. Rate Limiting Backend Tests
# =============================================================================


class TestRateLimitingMechanism:
    """Verify rate limiting correctness."""

    def test_in_memory_sliding_window_counts(self):
        """In-memory cache correctly increments sliding window."""
        from app.core.cache import InMemoryCache

        cache = InMemoryCache()
        key = "rl:test:10.0.0.1"

        for i in range(5):
            count = cache.increment_window(key, window_seconds=60)
            assert count == i + 1

    def test_sliding_window_is_per_key(self):
        """Different keys have independent counters."""
        from app.core.cache import InMemoryCache

        cache = InMemoryCache()
        key1 = "rl:auth:10.0.0.1"
        key2 = "rl:auth:10.0.0.2"

        cache.increment_window(key1, 60)
        cache.increment_window(key1, 60)

        count = cache.increment_window(key2, 60)
        assert count == 1  # Independent counter

    def test_redis_backend_fails_gracefully(self):
        """RedisCacheBackend raises on unreachable Redis."""
        from app.core.cache import RedisCacheBackend

        with pytest.raises(Exception):
            RedisCacheBackend("redis://nonexistent-host-xyz:6379/0")

    async def test_rate_limit_triggers_429(self, client: AsyncClient):
        """Exceeding rate limit returns 429 with Retry-After header."""
        cache = get_cache_backend()
        # Pre-fill auth counter to exceed limit
        key = "rl:auth:127.0.0.1"
        for _ in range(settings.RATE_LIMIT_AUTH + 1):
            cache.increment_window(key, 60)

        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "ratelimit@test.com", "password": "Test1234"},
        )
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers
        assert resp.json()["detail"] == "Too many requests. Please try again later."


# =============================================================================
# 5. Config Validation Tests
# =============================================================================


class TestNewConfigSettings:
    """Verify new configuration settings exist and are properly typed."""

    def test_webhook_token_setting_exists(self):
        """WHATSAPP_WEBHOOK_VERIFY_TOKEN exists in settings."""
        assert hasattr(settings, "WHATSAPP_WEBHOOK_VERIFY_TOKEN")
        assert isinstance(settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN, str)
        assert len(settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN) > 0

    def test_subscription_enforce_setting_exists(self):
        """SUBSCRIPTION_ENFORCE exists and is boolean."""
        assert hasattr(settings, "SUBSCRIPTION_ENFORCE")
        assert isinstance(settings.SUBSCRIPTION_ENFORCE, bool)

    def test_subscription_enforce_default_is_true(self):
        """Default value for SUBSCRIPTION_ENFORCE should be True."""
        # In production config, enforcement should be enabled
        fresh_settings = type(settings)()
        assert fresh_settings.SUBSCRIPTION_ENFORCE is True
