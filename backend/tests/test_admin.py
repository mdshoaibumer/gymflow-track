"""
Super Admin endpoint tests for GymFlow Track.

Coverage:
1. SaaS metrics — platform-wide dashboard data
2. Gym directory — listing, search, status filter
3. Gym detail — full gym info retrieval
4. Admin actions — extend trial, suspend/unsuspend, lock/unlock, change plan, activate
5. Audit logs — retrieval with filters
6. Gym deletion — with confirmation name
7. Impersonation — start/end gym owner impersonation
8. Platform analytics, health, settings
9. RBAC — all endpoints require SUPER_ADMIN
"""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_backend
from app.core.security import hash_password
from app.models.gym import Gym
from app.models.subscription import (
    SubscriptionPlan,
)
from app.models.user import User, UserRole
from app.services.billing_service import create_trial_subscription


# === Fixtures ===


@pytest.fixture
async def managed_gym(
    db_session: AsyncSession, test_plan: SubscriptionPlan
) -> Gym:
    """A gym for admin to manage."""
    gym = Gym(
        id=uuid4(),
        name="Managed Gym",
        slug=f"managed-gym-{uuid4().hex[:6]}",
        phone="9111000001",
        email="managed@test.com",
    )
    db_session.add(gym)
    await db_session.flush()
    return gym


@pytest.fixture
async def managed_gym_owner(
    db_session: AsyncSession, managed_gym: Gym
) -> User:
    """Owner of the managed gym."""
    user = User(
        id=uuid4(),
        gym_id=managed_gym.id,
        name="Managed Gym Owner",
        email=f"owner-{uuid4().hex[:6]}@managed.com",
        phone="9111000001",
        password_hash=hash_password("TestPass123"),
        role=UserRole.OWNER,
    )
    db_session.add(user)
    await db_session.flush()
    cache = get_cache_backend()
    cache.set(f"user_active:{user.id}", "1", 99999)
    cache.set(f"user_revoked_at:{user.id}", "", 99999)
    return user


@pytest.fixture
async def managed_gym_with_trial(
    db_session: AsyncSession,
    managed_gym: Gym,
    managed_gym_owner: User,
) -> Gym:
    """Managed gym with a trial subscription."""
    await create_trial_subscription(db_session, managed_gym.id, "starter")
    await db_session.flush()
    get_cache_backend().set(f"sub:{managed_gym.id}", "full", 99999)
    return managed_gym


# === RBAC: All endpoints require SUPER_ADMIN ===


class TestAdminRBAC:
    """Verify all admin endpoints reject non-super-admin users."""

    @pytest.mark.asyncio
    async def test_owner_cannot_access_metrics(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/admin/metrics", headers=auth_headers)
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_cannot_access_gym_directory(
        self, client: AsyncClient, admin_headers: dict
    ):
        resp = await client.get("/api/v1/admin/gyms", headers=admin_headers)
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_staff_cannot_access_audit_logs(
        self, client: AsyncClient, staff_headers: dict
    ):
        resp = await client.get("/api/v1/admin/audit-logs", headers=staff_headers)
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_unauthenticated_cannot_access(self, client: AsyncClient):
        resp = await client.get("/api/v1/admin/metrics")
        assert resp.status_code in (401, 403)


# === SaaS Metrics ===


class TestSaaSMetrics:
    """Test GET /api/v1/admin/metrics."""

    @pytest.mark.asyncio
    async def test_super_admin_can_view_metrics(
        self, client: AsyncClient, super_admin_headers: dict
    ):
        resp = await client.get(
            "/api/v1/admin/metrics", headers=super_admin_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "total_gyms" in data
        assert "total_members" in data
        assert "mrr_in_paise" in data
        assert isinstance(data["total_gyms"], int)


# === Gym Directory ===


class TestGymDirectory:
    """Test GET /api/v1/admin/gyms."""

    @pytest.mark.asyncio
    async def test_list_gyms(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        resp = await client.get(
            "/api/v1/admin/gyms", headers=super_admin_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "gyms" in data
        assert "total" in data
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_search_gyms(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        resp = await client.get(
            "/api/v1/admin/gyms?search=Managed",
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_pagination(
        self, client: AsyncClient, super_admin_headers: dict
    ):
        resp = await client.get(
            "/api/v1/admin/gyms?skip=0&limit=1",
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["gyms"]) <= 1


# === Gym Detail ===


class TestGymDetail:
    """Test GET /api/v1/admin/gyms/{gym_id}."""

    @pytest.mark.asyncio
    async def test_get_gym_detail(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        resp = await client.get(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}",
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Managed Gym"

    @pytest.mark.asyncio
    async def test_nonexistent_gym_returns_404(
        self, client: AsyncClient, super_admin_headers: dict
    ):
        resp = await client.get(
            f"/api/v1/admin/gyms/{uuid4()}",
            headers=super_admin_headers,
        )
        assert resp.status_code == 404


# === Extend Trial ===


class TestExtendTrial:
    """Test POST /api/v1/admin/gyms/{gym_id}/extend-trial."""

    @pytest.mark.asyncio
    async def test_extend_trial_success(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        resp = await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/extend-trial",
            json={"days": 7, "reason": "Customer request"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_extend_trial_nonexistent_gym(
        self, client: AsyncClient, super_admin_headers: dict
    ):
        resp = await client.post(
            f"/api/v1/admin/gyms/{uuid4()}/extend-trial",
            json={"days": 7, "reason": "Test"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 404


# === Suspend / Unsuspend ===


class TestSuspendUnsuspend:
    """Test suspend and unsuspend gym endpoints."""

    @pytest.mark.asyncio
    async def test_suspend_gym(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        resp = await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/suspend",
            json={"reason": "Payment fraud detected"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    @pytest.mark.asyncio
    async def test_unsuspend_gym(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        # Suspend first
        await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/suspend",
            json={"reason": "Investigation"},
            headers=super_admin_headers,
        )
        # Then unsuspend
        resp = await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/unsuspend",
            json={"reason": "Investigation complete"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True


# === Lock / Unlock ===


class TestLockUnlock:
    """Test lock and unlock gym endpoints."""

    @pytest.mark.asyncio
    async def test_lock_gym(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        resp = await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/lock",
            json={"reason": "Non-payment"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    @pytest.mark.asyncio
    async def test_unlock_gym(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        # Lock first
        await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/lock",
            json={"reason": "Test lock"},
            headers=super_admin_headers,
        )
        resp = await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/unlock",
            json={"new_status": "active", "reason": "Payment received"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True


# === Change Plan ===


class TestChangePlan:
    """Test POST /api/v1/admin/gyms/{gym_id}/change-plan."""

    @pytest.mark.asyncio
    async def test_change_plan(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        resp = await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/change-plan",
            json={"plan_tier": "pro", "reason": "Upgrade request"},
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    @pytest.mark.asyncio
    async def test_change_to_invalid_plan(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        resp = await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/change-plan",
            json={"plan_tier": "nonexistent", "reason": "Test"},
            headers=super_admin_headers,
        )
        assert resp.status_code in (404, 422)


# === Activate Subscription ===


class TestActivateSubscription:
    """Test POST /api/v1/admin/gyms/{gym_id}/activate."""

    @pytest.mark.asyncio
    async def test_activate_subscription(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        resp = await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/activate",
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True


# === Audit Logs ===


class TestAuditLogs:
    """Test GET /api/v1/admin/audit-logs."""

    @pytest.mark.asyncio
    async def test_list_audit_logs(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        # Perform an action to generate audit log
        await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/suspend",
            json={"reason": "Audit test"},
            headers=super_admin_headers,
        )

        resp = await client.get(
            "/api/v1/admin/audit-logs", headers=super_admin_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "entries" in data
        assert "total" in data

    @pytest.mark.asyncio
    async def test_filter_audit_logs_by_gym(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        # Generate log entry
        await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/suspend",
            json={"reason": "Filter test"},
            headers=super_admin_headers,
        )

        resp = await client.get(
            f"/api/v1/admin/audit-logs?gym_id={managed_gym_with_trial.id}",
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        # All returned logs should be for this gym
        for log in data.get("entries", []):
            if "gym_id" in log:
                assert log["gym_id"] == str(managed_gym_with_trial.id)


# === Gym Deletion ===


class TestGymDeletion:
    """Test DELETE /api/v1/admin/gyms/{gym_id}."""

    @pytest.mark.asyncio
    async def test_delete_gym_wrong_name_rejected(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        """Deletion requires exact gym name confirmation."""
        resp = await client.request(
            "DELETE",
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}",
            json={
                "confirm_name": "Wrong Name",
                "reason": "Test deletion",
            },
            headers=super_admin_headers,
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_delete_gym_success(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
    ):
        """Deletion with correct name succeeds."""
        resp = await client.request(
            "DELETE",
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}",
            json={
                "confirm_name": "Managed Gym",
                "reason": "No longer needed",
            },
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True


# === Impersonation ===


class TestImpersonation:
    """Test impersonation start/end endpoints."""

    @pytest.mark.asyncio
    async def test_start_impersonation(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
        managed_gym_owner: User,
    ):
        resp = await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/impersonate",
            headers=super_admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["gym_name"] == "Managed Gym"

    @pytest.mark.asyncio
    async def test_impersonation_token_works(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
        managed_gym_owner: User,
    ):
        """The impersonation token should allow accessing the gym's data."""
        imp_resp = await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/impersonate",
            headers=super_admin_headers,
        )
        imp_token = imp_resp.json()["access_token"]
        imp_headers = {"Authorization": f"Bearer {imp_token}"}

        # Should be able to access gym endpoints as the owner
        me_resp = await client.get("/api/v1/auth/me", headers=imp_headers)
        assert me_resp.status_code == 200
        assert me_resp.json()["id"] == str(managed_gym_owner.id)

    @pytest.mark.asyncio
    async def test_impersonate_nonexistent_gym(
        self, client: AsyncClient, super_admin_headers: dict
    ):
        resp = await client.post(
            f"/api/v1/admin/gyms/{uuid4()}/impersonate",
            headers=super_admin_headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_end_impersonation(
        self,
        client: AsyncClient,
        super_admin_headers: dict,
        managed_gym_with_trial: Gym,
        managed_gym_owner: User,
    ):
        # Start impersonation
        await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/impersonate",
            headers=super_admin_headers,
        )
        # End impersonation
        resp = await client.post(
            f"/api/v1/admin/gyms/{managed_gym_with_trial.id}/end-impersonation",
            headers=super_admin_headers,
        )
        assert resp.status_code == 200


# === Platform Analytics ===


class TestPlatformAnalytics:
    """Test GET /api/v1/admin/analytics."""

    @pytest.mark.asyncio
    async def test_get_analytics(
        self, client: AsyncClient, super_admin_headers: dict
    ):
        resp = await client.get(
            "/api/v1/admin/analytics", headers=super_admin_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "growth_trend" in data or "plan_distribution" in data


# === Platform Health ===


class TestPlatformHealth:
    """Test GET /api/v1/admin/health."""

    @pytest.mark.asyncio
    async def test_get_health(
        self, client: AsyncClient, super_admin_headers: dict
    ):
        resp = await client.get(
            "/api/v1/admin/health", headers=super_admin_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "database_status" in data or "status" in data


# === Platform Settings ===


class TestPlatformSettings:
    """Test GET/PUT /api/v1/admin/settings."""

    @pytest.mark.asyncio
    async def test_get_settings(
        self, client: AsyncClient, super_admin_headers: dict
    ):
        resp = await client.get(
            "/api/v1/admin/settings", headers=super_admin_headers
        )
        assert resp.status_code == 200
