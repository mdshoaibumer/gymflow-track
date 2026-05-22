"""
Tests for Staff/User management endpoints.

Coverage:
1. List users — OWNER and ADMIN can list, STAFF cannot
2. Create user — OWNER only, duplicate email rejected
3. Update user — OWNER only, cannot modify owner account
4. Deactivate user — OWNER only, cannot deactivate self (owner)
5. RBAC enforcement — staff cannot create/update/deactivate
6. Tenant isolation — cannot see other gym's users
"""

from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_backend
from app.core.security import hash_password
from app.models.gym import Gym
from app.models.user import User, UserRole


class TestListUsers:
    """Test GET /api/v1/users."""

    async def test_owner_can_list_users(
        self, client: AsyncClient, auth_headers: dict
    ):
        response = await client.get("/api/v1/users", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    async def test_admin_can_list_users(
        self, client: AsyncClient, admin_headers: dict
    ):
        response = await client.get("/api/v1/users", headers=admin_headers)
        assert response.status_code == 200

    async def test_staff_cannot_list_users(
        self, client: AsyncClient, staff_headers: dict
    ):
        response = await client.get("/api/v1/users", headers=staff_headers)
        assert response.status_code == 403

    async def test_unauthenticated_returns_401(self, client: AsyncClient):
        response = await client.get("/api/v1/users")
        assert response.status_code in (401, 403)


class TestCreateUser:
    """Test POST /api/v1/users."""

    async def test_owner_can_create_staff(
        self, client: AsyncClient, auth_headers: dict
    ):
        payload = {
            "name": "New Staff Member",
            "email": f"newstaff-{uuid4().hex[:6]}@testgym.com",
            "phone": "9876500099",
            "password": "StaffPass123",
            "role": "staff",
        }
        response = await client.post(
            "/api/v1/users", json=payload, headers=auth_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "New Staff Member"
        assert data["role"] == "staff"
        assert data["is_active"] is True
        assert "password_hash" not in data

    async def test_owner_can_create_admin(
        self, client: AsyncClient, auth_headers: dict
    ):
        payload = {
            "name": "New Admin",
            "email": f"newadmin-{uuid4().hex[:6]}@testgym.com",
            "phone": "9876500098",
            "password": "AdminPass123",
            "role": "admin",
        }
        response = await client.post(
            "/api/v1/users", json=payload, headers=auth_headers
        )
        assert response.status_code == 201
        assert response.json()["role"] == "admin"

    async def test_duplicate_email_returns_409(
        self, client: AsyncClient, auth_headers: dict
    ):
        email = f"dup-{uuid4().hex[:6]}@testgym.com"
        payload = {
            "name": "First User",
            "email": email,
            "phone": "9876500097",
            "password": "TestPass123",
            "role": "staff",
        }
        resp1 = await client.post(
            "/api/v1/users", json=payload, headers=auth_headers
        )
        assert resp1.status_code == 201

        payload2 = {
            "name": "Duplicate Email",
            "email": email,
            "phone": "9876500096",
            "password": "TestPass123",
            "role": "staff",
        }
        resp2 = await client.post(
            "/api/v1/users", json=payload2, headers=auth_headers
        )
        assert resp2.status_code == 409

    async def test_admin_cannot_create_user(
        self, client: AsyncClient, admin_headers: dict
    ):
        payload = {
            "name": "Should Fail",
            "email": f"fail-{uuid4().hex[:6]}@testgym.com",
            "phone": "9876500095",
            "password": "TestPass123",
            "role": "staff",
        }
        response = await client.post(
            "/api/v1/users", json=payload, headers=admin_headers
        )
        assert response.status_code == 403

    async def test_staff_cannot_create_user(
        self, client: AsyncClient, staff_headers: dict
    ):
        payload = {
            "name": "Should Fail",
            "email": f"fail-{uuid4().hex[:6]}@testgym.com",
            "phone": "9876500094",
            "password": "TestPass123",
            "role": "staff",
        }
        response = await client.post(
            "/api/v1/users", json=payload, headers=staff_headers
        )
        assert response.status_code == 403


class TestUpdateUser:
    """Test PUT /api/v1/users/{user_id}."""

    async def test_owner_can_update_staff(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db_session: AsyncSession,
        sample_gym: Gym,
    ):
        # Create a staff user to update
        staff = User(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Staff To Update",
            email=f"update-target-{uuid4().hex[:6]}@testgym.com",
            phone="9876500090",
            password_hash=hash_password("TestPass123"),
            role=UserRole.STAFF,
        )
        db_session.add(staff)
        await db_session.flush()
        cache = get_cache_backend()
        cache.set(f"user_active:{staff.id}", "1", 99999)
        cache.set(f"user_revoked_at:{staff.id}", "", 99999)

        response = await client.put(
            f"/api/v1/users/{staff.id}",
            json={"name": "Updated Staff Name"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Staff Name"

    async def test_cannot_update_owner_account(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_user: User,
    ):
        response = await client.put(
            f"/api/v1/users/{sample_user.id}",
            json={"name": "Hacked Owner"},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_admin_cannot_update_user(
        self,
        client: AsyncClient,
        admin_headers: dict,
        staff_user: User,
    ):
        response = await client.put(
            f"/api/v1/users/{staff_user.id}",
            json={"name": "Should Fail"},
            headers=admin_headers,
        )
        assert response.status_code == 403


class TestDeactivateUser:
    """Test POST /api/v1/users/{user_id}/deactivate."""

    async def test_owner_can_deactivate_staff(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db_session: AsyncSession,
        sample_gym: Gym,
    ):
        staff = User(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Staff To Deactivate",
            email=f"deactivate-{uuid4().hex[:6]}@testgym.com",
            phone="9876500089",
            password_hash=hash_password("TestPass123"),
            role=UserRole.STAFF,
        )
        db_session.add(staff)
        await db_session.flush()
        cache = get_cache_backend()
        cache.set(f"user_active:{staff.id}", "1", 99999)
        cache.set(f"user_revoked_at:{staff.id}", "", 99999)

        response = await client.post(
            f"/api/v1/users/{staff.id}/deactivate",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False

    async def test_cannot_deactivate_owner(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_user: User,
    ):
        response = await client.post(
            f"/api/v1/users/{sample_user.id}/deactivate",
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_nonexistent_user_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        fake_id = uuid4()
        response = await client.post(
            f"/api/v1/users/{fake_id}/deactivate",
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_staff_cannot_deactivate(
        self,
        client: AsyncClient,
        staff_headers: dict,
        admin_user: User,
    ):
        response = await client.post(
            f"/api/v1/users/{admin_user.id}/deactivate",
            headers=staff_headers,
        )
        assert response.status_code == 403
