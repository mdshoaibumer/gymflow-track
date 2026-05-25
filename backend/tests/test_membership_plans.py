"""
Integration tests for Gym Membership Plans feature.

Tests:
- Create membership plan
- List membership plans (active only)
- Update membership plan
- Delete (soft-delete) membership plan
- Tenant isolation (gym can't see another gym's plans)
- Validation (name required, amount > 0, duration > 0)
- Staff role can read plans but not create/update/delete
"""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_backend
from app.core.security import create_access_token, hash_password
from app.models.gym import Gym
from app.models.membership_plan import GymMembershipPlan
from app.models.subscription import BillingStatus, GymSubscription, PlanTier, SubscriptionPlan
from app.models.user import User, UserRole


class TestCreateMembershipPlan:
    """Test membership plan creation."""

    async def test_create_plan_success(self, client: AsyncClient, auth_headers: dict):
        """Owner can create a membership plan."""
        payload = {"name": "Monthly", "duration_months": 1, "amount": 1500}
        response = await client.post(
            "/api/v1/membership-plans", json=payload, headers=auth_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Monthly"
        assert data["duration_months"] == 1
        assert data["amount"] == 1500
        assert data["is_active"] is True
        assert "id" in data

    async def test_create_quarterly_plan(self, client: AsyncClient, auth_headers: dict):
        """Owner can create a quarterly plan."""
        payload = {"name": "Quarterly", "duration_months": 3, "amount": 4000}
        response = await client.post(
            "/api/v1/membership-plans", json=payload, headers=auth_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Quarterly"
        assert data["duration_months"] == 3
        assert data["amount"] == 4000

    async def test_create_yearly_plan(self, client: AsyncClient, auth_headers: dict):
        """Owner can create a yearly plan."""
        payload = {"name": "Annual", "duration_months": 12, "amount": 12000}
        response = await client.post(
            "/api/v1/membership-plans", json=payload, headers=auth_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["duration_months"] == 12
        assert data["amount"] == 12000

    async def test_create_plan_name_required(self, client: AsyncClient, auth_headers: dict):
        """Plan name is required."""
        payload = {"name": "", "duration_months": 1, "amount": 1500}
        response = await client.post(
            "/api/v1/membership-plans", json=payload, headers=auth_headers
        )
        assert response.status_code == 422

    async def test_create_plan_amount_must_be_positive(self, client: AsyncClient, auth_headers: dict):
        """Amount must be >= 1."""
        payload = {"name": "Free Plan", "duration_months": 1, "amount": 0}
        response = await client.post(
            "/api/v1/membership-plans", json=payload, headers=auth_headers
        )
        assert response.status_code == 422

    async def test_create_plan_duration_must_be_positive(self, client: AsyncClient, auth_headers: dict):
        """Duration must be >= 1."""
        payload = {"name": "Invalid", "duration_months": 0, "amount": 1000}
        response = await client.post(
            "/api/v1/membership-plans", json=payload, headers=auth_headers
        )
        assert response.status_code == 422


class TestListMembershipPlans:
    """Test listing membership plans."""

    async def test_list_plans_empty(self, client: AsyncClient, auth_headers: dict):
        """Empty list when no plans configured."""
        response = await client.get(
            "/api/v1/membership-plans", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["plans"] == []

    async def test_list_plans_returns_created_plans(self, client: AsyncClient, auth_headers: dict):
        """List returns plans after creating them."""
        # Create two plans
        await client.post(
            "/api/v1/membership-plans",
            json={"name": "Monthly", "duration_months": 1, "amount": 1500},
            headers=auth_headers,
        )
        await client.post(
            "/api/v1/membership-plans",
            json={"name": "Yearly", "duration_months": 12, "amount": 12000},
            headers=auth_headers,
        )

        response = await client.get(
            "/api/v1/membership-plans", headers=auth_headers
        )
        assert response.status_code == 200
        plans = response.json()["plans"]
        assert len(plans) == 2
        # Ordered by amount
        assert plans[0]["name"] == "Monthly"
        assert plans[1]["name"] == "Yearly"


class TestUpdateMembershipPlan:
    """Test updating membership plans."""

    async def test_update_plan_name(self, client: AsyncClient, auth_headers: dict):
        """Owner can update plan name."""
        # Create
        create_resp = await client.post(
            "/api/v1/membership-plans",
            json={"name": "Basic", "duration_months": 1, "amount": 1000},
            headers=auth_headers,
        )
        plan_id = create_resp.json()["id"]

        # Update
        response = await client.patch(
            f"/api/v1/membership-plans/{plan_id}",
            json={"name": "Standard"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Standard"

    async def test_update_plan_amount(self, client: AsyncClient, auth_headers: dict):
        """Owner can update plan amount."""
        create_resp = await client.post(
            "/api/v1/membership-plans",
            json={"name": "Gold", "duration_months": 6, "amount": 5000},
            headers=auth_headers,
        )
        plan_id = create_resp.json()["id"]

        response = await client.patch(
            f"/api/v1/membership-plans/{plan_id}",
            json={"amount": 5500},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["amount"] == 5500

    async def test_update_nonexistent_plan(self, client: AsyncClient, auth_headers: dict):
        """Updating a non-existent plan returns 404."""
        fake_id = str(uuid4())
        response = await client.patch(
            f"/api/v1/membership-plans/{fake_id}",
            json={"name": "Ghost"},
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestDeleteMembershipPlan:
    """Test deleting (soft-delete) membership plans."""

    async def test_delete_plan(self, client: AsyncClient, auth_headers: dict):
        """Owner can delete a plan (soft-delete)."""
        create_resp = await client.post(
            "/api/v1/membership-plans",
            json={"name": "Temporary", "duration_months": 1, "amount": 500},
            headers=auth_headers,
        )
        plan_id = create_resp.json()["id"]

        # Delete
        response = await client.delete(
            f"/api/v1/membership-plans/{plan_id}", headers=auth_headers
        )
        assert response.status_code == 204

        # Verify it's gone from the list
        list_resp = await client.get(
            "/api/v1/membership-plans", headers=auth_headers
        )
        plans = list_resp.json()["plans"]
        plan_ids = [p["id"] for p in plans]
        assert plan_id not in plan_ids

    async def test_delete_nonexistent_plan(self, client: AsyncClient, auth_headers: dict):
        """Deleting a non-existent plan returns 404."""
        fake_id = str(uuid4())
        response = await client.delete(
            f"/api/v1/membership-plans/{fake_id}", headers=auth_headers
        )
        assert response.status_code == 404


class TestMembershipPlanTenantIsolation:
    """Test that plans are tenant-scoped — gym can't see another gym's plans."""

    async def test_cannot_see_other_gym_plans(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db_session: AsyncSession,
        sample_gym,
        test_plan: SubscriptionPlan,
    ):
        """Plans are scoped to the gym — other gyms can't see them."""
        # Create a plan for the sample gym
        await client.post(
            "/api/v1/membership-plans",
            json={"name": "Premium", "duration_months": 12, "amount": 15000},
            headers=auth_headers,
        )

        # Create another gym + user
        other_gym = Gym(
            id=uuid4(),
            name="Other Gym",
            slug=f"other-gym-{uuid4().hex[:8]}",
            phone="9000000001",
            email="other2@gym.com",
        )
        db_session.add(other_gym)
        await db_session.flush()

        sub = GymSubscription(
            id=uuid4(),
            gym_id=other_gym.id,
            plan_id=test_plan.id,
            status=BillingStatus.ACTIVE,
        )
        db_session.add(sub)
        await db_session.flush()

        other_user = User(
            id=uuid4(),
            gym_id=other_gym.id,
            name="Other Owner",
            email="other_owner2@gym.com",
            phone="9000000002",
            password_hash=hash_password("TestPass123"),
            role=UserRole.OWNER,
        )
        db_session.add(other_user)
        await db_session.flush()

        # Seed caches for other user
        cache = get_cache_backend()
        cache.set(f"user_active:{other_user.id}", "1", 99999)
        cache.set(f"user_revoked_at:{other_user.id}", "", 99999)
        cache.set(f"sub:{other_gym.id}", "full", 99999)

        other_token = create_access_token(other_user.id, other_gym.id, other_user.role.value)
        other_headers = {"Authorization": f"Bearer {other_token}"}

        # Other gym should see no plans
        response = await client.get(
            "/api/v1/membership-plans", headers=other_headers
        )
        assert response.status_code == 200
        assert response.json()["plans"] == []


class TestMembershipPlanRBAC:
    """Test role-based access control for membership plans."""

    async def test_staff_can_read_plans(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        sample_gym,
        auth_headers: dict,
    ):
        """Staff users can list plans (they need it to record payments)."""
        # Create a plan as owner
        await client.post(
            "/api/v1/membership-plans",
            json={"name": "Staff Visible", "duration_months": 1, "amount": 1200},
            headers=auth_headers,
        )

        # Create a staff user
        staff_user = User(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Staff Member",
            email=f"staff_{uuid4().hex[:6]}@gym.com",
            phone="9111111111",
            password_hash=hash_password("TestPass123"),
            role=UserRole.STAFF,
        )
        db_session.add(staff_user)
        await db_session.flush()

        cache = get_cache_backend()
        cache.set(f"user_active:{staff_user.id}", "1", 99999)
        cache.set(f"user_revoked_at:{staff_user.id}", "", 99999)

        staff_token = create_access_token(staff_user.id, sample_gym.id, staff_user.role.value)
        staff_headers = {"Authorization": f"Bearer {staff_token}"}

        # Staff can read plans
        response = await client.get(
            "/api/v1/membership-plans", headers=staff_headers
        )
        assert response.status_code == 200
        assert len(response.json()["plans"]) >= 1

    async def test_staff_cannot_create_plans(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        sample_gym,
    ):
        """Staff users cannot create plans."""
        staff_user = User(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Staff No Create",
            email=f"staff_nc_{uuid4().hex[:6]}@gym.com",
            phone="9222222222",
            password_hash=hash_password("TestPass123"),
            role=UserRole.STAFF,
        )
        db_session.add(staff_user)
        await db_session.flush()

        cache = get_cache_backend()
        cache.set(f"user_active:{staff_user.id}", "1", 99999)
        cache.set(f"user_revoked_at:{staff_user.id}", "", 99999)

        staff_token = create_access_token(staff_user.id, sample_gym.id, staff_user.role.value)
        staff_headers = {"Authorization": f"Bearer {staff_token}"}

        response = await client.post(
            "/api/v1/membership-plans",
            json={"name": "Unauthorized", "duration_months": 1, "amount": 1000},
            headers=staff_headers,
        )
        assert response.status_code == 403

    async def test_unauthenticated_cannot_access(self, client: AsyncClient):
        """Unauthenticated requests are rejected."""
        response = await client.get("/api/v1/membership-plans")
        assert response.status_code in (401, 403)
