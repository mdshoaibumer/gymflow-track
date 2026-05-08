"""
Integration tests for Member CRUD operations.

Tests:
- Create member (happy path, duplicate phone)
- List members (pagination, tenant-scoped, search)
- Get member by ID
- Update member (PATCH partial, PUT full replacement)
- Delete member
- Search functionality
- Tenant isolation (gym A cannot see gym B's members)
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gym import Gym
from app.models.user import User


class TestCreateMember:
    """Test member creation."""

    async def test_create_member_success(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Happy path: create a member with valid data."""
        payload = {
            "name": "Amit Sharma",
            "phone": "9876500001",
            "email": "amit@email.com",
            "gender": "male",
            "membership_plan": "Monthly",
            "amount_paid": 200000,  # ₹2000 in paise
        }

        response = await client.post(
            "/api/v1/members", json=payload, headers=auth_headers
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Amit Sharma"
        assert data["phone"] == "9876500001"
        assert data["membership_status"] == "active"
        assert data["amount_paid"] == 200000
        assert "id" in data

    async def test_create_member_duplicate_phone_returns_409(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Same phone number within the same gym is rejected."""
        payload = {
            "name": "First Member",
            "phone": "9876500002",
        }
        resp1 = await client.post(
            "/api/v1/members", json=payload, headers=auth_headers
        )
        assert resp1.status_code == 201

        # Same phone again
        payload["name"] = "Second Member"
        resp2 = await client.post(
            "/api/v1/members", json=payload, headers=auth_headers
        )
        assert resp2.status_code == 409

    async def test_create_member_unauthenticated_returns_401(
        self, client: AsyncClient
    ):
        """No token → 401."""
        payload = {"name": "Ghost", "phone": "9876500003"}
        response = await client.post("/api/v1/members", json=payload)
        assert response.status_code in (401, 403)


class TestListMembers:
    """Test member listing."""

    async def test_list_members_empty(
        self, client: AsyncClient, auth_headers: dict
    ):
        """New gym has no members."""
        response = await client.get("/api/v1/members", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["members"] == []
        assert data["total"] == 0

    async def test_list_members_returns_created(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Created members appear in the list."""
        # Create 2 members
        for i in range(2):
            await client.post(
                "/api/v1/members",
                json={"name": f"Member {i}", "phone": f"987650010{i}"},
                headers=auth_headers,
            )

        response = await client.get("/api/v1/members", headers=auth_headers)
        data = response.json()
        assert data["total"] == 2
        assert len(data["members"]) == 2

    async def test_list_members_respects_pagination(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Pagination params work correctly."""
        # Create 3 members
        for i in range(3):
            await client.post(
                "/api/v1/members",
                json={"name": f"Paginated {i}", "phone": f"987650020{i}"},
                headers=auth_headers,
            )

        response = await client.get(
            "/api/v1/members?skip=0&limit=2", headers=auth_headers
        )
        data = response.json()
        assert len(data["members"]) == 2
        assert data["total"] == 3  # Total is still 3


class TestGetMember:
    """Test fetching a single member."""

    async def test_get_member_by_id(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Can fetch a member by ID."""
        create_resp = await client.post(
            "/api/v1/members",
            json={"name": "Fetch Me", "phone": "9876500030"},
            headers=auth_headers,
        )
        member_id = create_resp.json()["id"]

        response = await client.get(
            f"/api/v1/members/{member_id}", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Fetch Me"

    async def test_get_nonexistent_member_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Random UUID returns 404."""
        import uuid

        fake_id = str(uuid.uuid4())
        response = await client.get(
            f"/api/v1/members/{fake_id}", headers=auth_headers
        )
        assert response.status_code == 404


class TestUpdateMember:
    """Test member updates."""

    async def test_update_member_partial(
        self, client: AsyncClient, auth_headers: dict
    ):
        """PATCH updates only specified fields."""
        create_resp = await client.post(
            "/api/v1/members",
            json={"name": "Original Name", "phone": "9876500040"},
            headers=auth_headers,
        )
        member_id = create_resp.json()["id"]

        response = await client.patch(
            f"/api/v1/members/{member_id}",
            json={"name": "Updated Name"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"
        assert response.json()["phone"] == "9876500040"  # Unchanged

    async def test_put_replaces_member(
        self, client: AsyncClient, auth_headers: dict
    ):
        """PUT replaces the full member resource."""
        create_resp = await client.post(
            "/api/v1/members",
            json={"name": "Before Put", "phone": "9876500041", "membership_plan": "Monthly"},
            headers=auth_headers,
        )
        member_id = create_resp.json()["id"]

        response = await client.put(
            f"/api/v1/members/{member_id}",
            json={"name": "After Put", "phone": "9876500041", "amount_paid": 150000},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "After Put"
        assert data["amount_paid"] == 150000

    async def test_update_phone_to_duplicate_returns_409(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Cannot update a member's phone to one already used in the same gym."""
        await client.post(
            "/api/v1/members",
            json={"name": "Member A", "phone": "9876500042"},
            headers=auth_headers,
        )
        create_resp = await client.post(
            "/api/v1/members",
            json={"name": "Member B", "phone": "9876500043"},
            headers=auth_headers,
        )
        member_b_id = create_resp.json()["id"]

        # Try to change B's phone to A's phone
        response = await client.patch(
            f"/api/v1/members/{member_b_id}",
            json={"phone": "9876500042"},
            headers=auth_headers,
        )
        assert response.status_code == 409


class TestDeleteMember:
    """Test member deletion."""

    async def test_delete_member_success(
        self, client: AsyncClient, auth_headers: dict
    ):
        """OWNER can delete a member — returns 204."""
        create_resp = await client.post(
            "/api/v1/members",
            json={"name": "Delete Target", "phone": "9876500044"},
            headers=auth_headers,
        )
        member_id = create_resp.json()["id"]

        response = await client.delete(
            f"/api/v1/members/{member_id}", headers=auth_headers
        )
        assert response.status_code == 204

        # Verify it's gone
        get_resp = await client.get(
            f"/api/v1/members/{member_id}", headers=auth_headers
        )
        assert get_resp.status_code == 404

    async def test_delete_nonexistent_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Deleting a non-existent member returns 404."""
        import uuid

        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"/api/v1/members/{fake_id}", headers=auth_headers
        )
        assert response.status_code == 404


class TestSearchMembers:
    """Test search functionality."""

    async def test_search_by_name(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Search matches members by name (case-insensitive)."""
        await client.post(
            "/api/v1/members",
            json={"name": "Rahul Verma", "phone": "9876500090"},
            headers=auth_headers,
        )
        await client.post(
            "/api/v1/members",
            json={"name": "Priya Singh", "phone": "9876500091"},
            headers=auth_headers,
        )

        response = await client.get(
            "/api/v1/members?search=rahul", headers=auth_headers
        )
        data = response.json()
        assert data["total"] == 1
        assert data["members"][0]["name"] == "Rahul Verma"

    async def test_search_by_phone(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Search matches members by phone number."""
        await client.post(
            "/api/v1/members",
            json={"name": "Phone Search", "phone": "9876500092"},
            headers=auth_headers,
        )

        response = await client.get(
            "/api/v1/members?search=500092", headers=auth_headers
        )
        data = response.json()
        assert data["total"] == 1
        assert data["members"][0]["phone"] == "9876500092"

    async def test_search_no_results(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Search with no match returns empty list."""
        response = await client.get(
            "/api/v1/members?search=zzzznonexistent", headers=auth_headers
        )
        data = response.json()
        assert data["total"] == 0
        assert data["members"] == []

    async def test_search_is_tenant_scoped(
        self, client: AsyncClient, auth_headers: dict, other_auth_headers: dict
    ):
        """Search does not leak data across tenants."""
        await client.post(
            "/api/v1/members",
            json={"name": "Gym A Secret", "phone": "9876500093"},
            headers=auth_headers,
        )

        # Gym B searches for it — should find nothing
        response = await client.get(
            "/api/v1/members?search=Secret", headers=other_auth_headers
        )
        assert response.json()["total"] == 0
class TestTenantIsolation:
    """
    CRITICAL: Verify multi-tenant data isolation.

    These tests ensure that gym A cannot access, modify, or enumerate
    gym B's members. A failure here is a data breach.
    """

    async def test_gym_a_cannot_see_gym_b_members(
        self,
        client: AsyncClient,
        auth_headers: dict,
        other_auth_headers: dict,
    ):
        """Members created in gym A do not appear in gym B's list."""
        # Create member in gym A
        await client.post(
            "/api/v1/members",
            json={"name": "Gym A Member", "phone": "9876500050"},
            headers=auth_headers,
        )

        # List members as gym B — should be empty
        response = await client.get("/api/v1/members", headers=other_auth_headers)
        data = response.json()
        assert data["total"] == 0
        assert data["members"] == []

    async def test_gym_a_cannot_get_gym_b_member_by_id(
        self,
        client: AsyncClient,
        auth_headers: dict,
        other_auth_headers: dict,
    ):
        """Gym A cannot fetch gym B's member by ID (returns 404, not 403)."""
        # Create member in gym A
        create_resp = await client.post(
            "/api/v1/members",
            json={"name": "Secret Member", "phone": "9876500060"},
            headers=auth_headers,
        )
        member_id = create_resp.json()["id"]

        # Gym B tries to access it — should get 404 (not 403, to avoid
        # leaking that the resource exists)
        response = await client.get(
            f"/api/v1/members/{member_id}", headers=other_auth_headers
        )
        assert response.status_code == 404

    async def test_gym_a_cannot_update_gym_b_member(
        self,
        client: AsyncClient,
        auth_headers: dict,
        other_auth_headers: dict,
    ):
        """Gym A cannot modify gym B's member."""
        # Create member in gym A
        create_resp = await client.post(
            "/api/v1/members",
            json={"name": "Protected Member", "phone": "9876500070"},
            headers=auth_headers,
        )
        member_id = create_resp.json()["id"]

        # Gym B tries to update it
        response = await client.patch(
            f"/api/v1/members/{member_id}",
            json={"name": "Hacked Name"},
            headers=other_auth_headers,
        )
        assert response.status_code == 404

    async def test_same_phone_allowed_in_different_gyms(
        self,
        client: AsyncClient,
        auth_headers: dict,
        other_auth_headers: dict,
    ):
        """
        Same phone number can exist in multiple gyms (different tenants).
        This validates the composite unique constraint (gym_id, phone)
        rather than a global unique on phone alone.
        """
        phone = "9876500080"

        # Create in gym A
        resp1 = await client.post(
            "/api/v1/members",
            json={"name": "Member in A", "phone": phone},
            headers=auth_headers,
        )
        assert resp1.status_code == 201

        # Same phone in gym B — should succeed
        resp2 = await client.post(
            "/api/v1/members",
            json={"name": "Member in B", "phone": phone},
            headers=other_auth_headers,
        )
        assert resp2.status_code == 201
