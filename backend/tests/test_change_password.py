"""Tests for POST /auth/change-password endpoint."""

import pytest

from app.core.security import verify_password


@pytest.mark.anyio
class TestChangePassword:
    """Tests for the change-password endpoint."""

    async def test_change_password_success(self, client, sample_user, auth_headers, db_session):
        """Successfully change password with valid current password."""
        response = await client.post(
            "/auth/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "NewSecure1Pass",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "success" in data["message"].lower() or "changed" in data["message"].lower()

        # Verify the password was actually updated in DB
        await db_session.refresh(sample_user)
        assert verify_password("NewSecure1Pass", sample_user.password_hash)

    async def test_change_password_wrong_current(self, client, auth_headers):
        """Reject when current_password is incorrect."""
        response = await client.post(
            "/auth/change-password",
            json={
                "current_password": "WrongPassword1",
                "new_password": "NewSecure1Pass",
            },
            headers=auth_headers,
        )
        assert response.status_code in (400, 401, 403)

    async def test_change_password_same_as_current(self, client, auth_headers):
        """Reject when new password is same as current."""
        response = await client.post(
            "/auth/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "TestPass123",
            },
            headers=auth_headers,
        )
        assert response.status_code in (400, 422)

    async def test_change_password_too_short(self, client, auth_headers):
        """Reject when new password is too short."""
        response = await client.post(
            "/auth/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "Sh1",
            },
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_change_password_no_auth(self, client):
        """Require authentication."""
        response = await client.post(
            "/auth/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "NewSecure1Pass",
            },
        )
        assert response.status_code == 401

    async def test_change_password_revokes_sessions(self, client, sample_user, auth_headers, db_session):
        """After password change, sessions_revoked_at should be set."""
        response = await client.post(
            "/auth/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "AnotherNew1Pass",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200

        await db_session.refresh(sample_user)
        assert sample_user.sessions_revoked_at is not None
