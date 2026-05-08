"""
Integration tests for Gym endpoints.

Tests:
- Get current gym info
- Update gym info
- Unauthenticated access rejected
"""

import pytest
from httpx import AsyncClient


class TestGetGym:
    """Test GET /api/v1/gyms/me."""

    async def test_get_my_gym(self, client: AsyncClient, auth_headers: dict):
        """Authenticated user can retrieve their gym info."""
        response = await client.get("/api/v1/gyms/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Gym"
        assert "id" in data
        assert "slug" in data

    async def test_get_gym_unauthenticated_returns_401(self, client: AsyncClient):
        """No token → 401."""
        response = await client.get("/api/v1/gyms/me")
        assert response.status_code in (401, 403)


class TestUpdateGym:
    """Test PATCH /api/v1/gyms/me."""

    async def test_update_gym_name(self, client: AsyncClient, auth_headers: dict):
        """Can update gym name."""
        response = await client.patch(
            "/api/v1/gyms/me",
            json={"name": "Updated Gym Name"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Gym Name"

    async def test_update_gym_partial(self, client: AsyncClient, auth_headers: dict):
        """Partial update leaves other fields unchanged."""
        response = await client.patch(
            "/api/v1/gyms/me",
            json={"city": "Pune"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["city"] == "Pune"
        assert data["name"] == "Test Gym"  # Unchanged
