"""
Integration tests for Role-Based Access Control (RBAC).

Tests the permission matrix:
    ┌──────────────────────┬───────┬───────┬───────┐
    │ Action               │ OWNER │ ADMIN │ STAFF │
    ├──────────────────────┼───────┼───────┼───────┤
    │ View members         │  ✓    │  ✓    │  ✓    │
    │ Create member        │  ✓    │  ✓    │  ✗    │
    │ Update member        │  ✓    │  ✓    │  ✗    │
    │ Delete member        │  ✓    │  ✓    │  ✗    │
    │ View gym             │  ✓    │  ✓    │  ✓    │
    │ Update gym           │  ✓    │  ✗    │  ✗    │
    └──────────────────────┴───────┴───────┴───────┘

Also tests:
- Tenant isolation combined with RBAC
- Token without role is rejected
- Cross-gym admin cannot access other gym's resources
"""

import pytest
from httpx import AsyncClient


class TestMemberRBAC:
    """Test role enforcement on member endpoints."""

    # --- List members: all roles allowed ---

    async def test_owner_can_list_members(
        self, client: AsyncClient, auth_headers: dict
    ):
        response = await client.get("/api/v1/members", headers=auth_headers)
        assert response.status_code == 200

    async def test_admin_can_list_members(
        self, client: AsyncClient, admin_headers: dict
    ):
        response = await client.get("/api/v1/members", headers=admin_headers)
        assert response.status_code == 200

    async def test_staff_can_list_members(
        self, client: AsyncClient, staff_headers: dict
    ):
        response = await client.get("/api/v1/members", headers=staff_headers)
        assert response.status_code == 200

    # --- Create member: OWNER + ADMIN only ---

    async def test_owner_can_create_member(
        self, client: AsyncClient, auth_headers: dict
    ):
        payload = {"name": "New Member", "phone": "9876500001"}
        response = await client.post(
            "/api/v1/members", json=payload, headers=auth_headers
        )
        assert response.status_code == 201

    async def test_admin_can_create_member(
        self, client: AsyncClient, admin_headers: dict
    ):
        payload = {"name": "Admin Created", "phone": "9876500002"}
        response = await client.post(
            "/api/v1/members", json=payload, headers=admin_headers
        )
        assert response.status_code == 201

    async def test_staff_cannot_create_member(
        self, client: AsyncClient, staff_headers: dict
    ):
        payload = {"name": "Staff Attempt", "phone": "9876500003"}
        response = await client.post(
            "/api/v1/members", json=payload, headers=staff_headers
        )
        assert response.status_code == 403
        assert "role" in response.json()["detail"].lower()

    # --- Update member: OWNER + ADMIN only ---

    async def test_staff_cannot_update_member(
        self, client: AsyncClient, auth_headers: dict, staff_headers: dict
    ):
        # Create a member as owner first
        payload = {"name": "Update Target", "phone": "9876500010"}
        create_resp = await client.post(
            "/api/v1/members", json=payload, headers=auth_headers
        )
        member_id = create_resp.json()["id"]

        # Staff tries to update → 403
        update_resp = await client.patch(
            f"/api/v1/members/{member_id}",
            json={"name": "Hacked Name"},
            headers=staff_headers,
        )
        assert update_resp.status_code == 403

    # --- Delete member: OWNER + ADMIN only, STAFF blocked ---

    async def test_owner_can_delete_member(
        self, client: AsyncClient, auth_headers: dict
    ):
        # Create then delete
        payload = {"name": "Delete Me", "phone": "9876500020"}
        create_resp = await client.post(
            "/api/v1/members", json=payload, headers=auth_headers
        )
        member_id = create_resp.json()["id"]

        delete_resp = await client.delete(
            f"/api/v1/members/{member_id}", headers=auth_headers
        )
        assert delete_resp.status_code == 204

    async def test_admin_can_delete_member(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict
    ):
        # Create as owner, delete as admin
        payload = {"name": "Admin Deletes", "phone": "9876500021"}
        create_resp = await client.post(
            "/api/v1/members", json=payload, headers=auth_headers
        )
        member_id = create_resp.json()["id"]

        delete_resp = await client.delete(
            f"/api/v1/members/{member_id}", headers=admin_headers
        )
        assert delete_resp.status_code == 204

    async def test_staff_cannot_delete_member(
        self, client: AsyncClient, auth_headers: dict, staff_headers: dict
    ):
        # Create as owner
        payload = {"name": "Protected Member", "phone": "9876500022"}
        create_resp = await client.post(
            "/api/v1/members", json=payload, headers=auth_headers
        )
        member_id = create_resp.json()["id"]

        # Staff tries to delete → 403
        delete_resp = await client.delete(
            f"/api/v1/members/{member_id}", headers=staff_headers
        )
        assert delete_resp.status_code == 403


class TestGymRBAC:
    """Test role enforcement on gym endpoints."""

    async def test_owner_can_update_gym(
        self, client: AsyncClient, auth_headers: dict
    ):
        response = await client.patch(
            "/api/v1/gyms/me",
            json={"name": "Owner Updated Gym"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Owner Updated Gym"

    async def test_admin_cannot_update_gym(
        self, client: AsyncClient, admin_headers: dict
    ):
        response = await client.patch(
            "/api/v1/gyms/me",
            json={"name": "Admin Attempt"},
            headers=admin_headers,
        )
        assert response.status_code == 403

    async def test_staff_cannot_update_gym(
        self, client: AsyncClient, staff_headers: dict
    ):
        response = await client.patch(
            "/api/v1/gyms/me",
            json={"name": "Staff Attempt"},
            headers=staff_headers,
        )
        assert response.status_code == 403

    async def test_all_roles_can_view_gym(
        self, client: AsyncClient, auth_headers: dict, admin_headers: dict, staff_headers: dict
    ):
        """All authenticated users can read gym info."""
        for headers in [auth_headers, admin_headers, staff_headers]:
            response = await client.get("/api/v1/gyms/me", headers=headers)
            assert response.status_code == 200


class TestTenantIsolationWithRBAC:
    """Test that RBAC doesn't bypass tenant boundaries."""

    async def test_other_gym_admin_cannot_access_members(
        self, client: AsyncClient, auth_headers: dict, other_auth_headers: dict
    ):
        """An OWNER from gym B cannot see gym A's members."""
        # Create member in gym A
        payload = {"name": "Gym A Member", "phone": "9876500030"}
        create_resp = await client.post(
            "/api/v1/members", json=payload, headers=auth_headers
        )
        assert create_resp.status_code == 201
        member_id = create_resp.json()["id"]

        # Gym B owner tries to access → 404 (not 403, because we don't leak existence)
        get_resp = await client.get(
            f"/api/v1/members/{member_id}", headers=other_auth_headers
        )
        assert get_resp.status_code == 404

    async def test_other_gym_owner_cannot_delete_members(
        self, client: AsyncClient, auth_headers: dict, other_auth_headers: dict
    ):
        """Cross-tenant deletion is blocked."""
        payload = {"name": "Cross-Tenant Target", "phone": "9876500031"}
        create_resp = await client.post(
            "/api/v1/members", json=payload, headers=auth_headers
        )
        member_id = create_resp.json()["id"]

        delete_resp = await client.delete(
            f"/api/v1/members/{member_id}", headers=other_auth_headers
        )
        assert delete_resp.status_code == 404


class TestTokenIntegrity:
    """Test that malformed/tampered tokens are rejected."""

    async def test_token_without_role_rejected(self, client: AsyncClient):
        """A token missing the role claim is treated as invalid."""
        from app.core.config import settings
        from jose import jwt

        # Craft a token without 'role' claim
        payload = {"sub": "fake-id", "gym_id": "fake-gym", "type": "access", "exp": 9999999999}
        bad_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

        response = await client.get(
            "/api/v1/members",
            headers={"Authorization": f"Bearer {bad_token}"},
        )
        assert response.status_code == 401

    async def test_token_with_invalid_role_rejected(self, client: AsyncClient):
        """A token with a non-existent role is treated as invalid."""
        from app.core.config import settings
        from jose import jwt
        from uuid import uuid4

        payload = {
            "sub": str(uuid4()),
            "gym_id": str(uuid4()),
            "role": "superadmin",  # doesn't exist
            "type": "access",
            "exp": 9999999999,
        }
        bad_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

        response = await client.get(
            "/api/v1/members",
            headers={"Authorization": f"Bearer {bad_token}"},
        )
        assert response.status_code == 401

    async def test_expired_token_rejected(self, client: AsyncClient):
        """An expired JWT returns 401."""
        from datetime import datetime, timezone, timedelta
        from app.core.config import settings
        from jose import jwt
        from uuid import uuid4

        payload = {
            "sub": str(uuid4()),
            "gym_id": str(uuid4()),
            "role": "owner",
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        }
        expired_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

        response = await client.get(
            "/api/v1/members",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert response.status_code == 401

    async def test_garbage_token_rejected(self, client: AsyncClient):
        """Completely invalid token string returns 401."""
        response = await client.get(
            "/api/v1/members",
            headers={"Authorization": "Bearer not.a.valid.jwt.at.all"},
        )
        assert response.status_code == 401

    async def test_no_authorization_header_returns_403(self, client: AsyncClient):
        """Missing Authorization header returns 401/403."""
        response = await client.get("/api/v1/members")
        assert response.status_code in (401, 403)
