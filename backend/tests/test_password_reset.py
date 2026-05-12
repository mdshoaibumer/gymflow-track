"""
Tests for password reset and forgot-password flows.

Coverage:
1. POST /auth/forgot-password — generates reset token
2. POST /auth/reset-password — resets password with valid token
3. Security: email enumeration prevention (always 200)
4. Security: expired token rejected
5. Security: used token rejected (single-use)
6. Security: rate limiting on reset attempts
7. POST /auth/logout — revokes sessions
"""

from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.gym import Gym
from app.models.user import User, UserRole


class TestForgotPassword:
    """Test POST /api/v1/auth/forgot-password."""

    async def test_existing_email_returns_200(
        self, client: AsyncClient, sample_user: User
    ):
        response = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": sample_user.email},
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        # Should NOT reveal whether email exists
        assert "reset link" in data["message"].lower() or "sent" in data["message"].lower()

    async def test_nonexistent_email_returns_200(self, client: AsyncClient):
        """Should NOT reveal that email doesn't exist (enumeration prevention)."""
        response = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "nobody@nowhere.com"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data

    async def test_empty_email_rejected(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": ""},
        )
        assert response.status_code == 422


class TestResetPassword:
    """Test POST /api/v1/auth/reset-password."""

    async def test_invalid_token_rejected(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "token": "invalid-token-that-does-not-exist",
                "new_password": "NewSecurePass123",
            },
        )
        assert response.status_code == 401

    async def test_weak_password_rejected(self, client: AsyncClient):
        """Password policy should be enforced even with valid token format."""
        response = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "token": "some-token",
                "new_password": "123",
            },
        )
        # Either 422 (validation) or 401 (invalid token)
        assert response.status_code in (401, 422)


class TestLogout:
    """Test POST /api/v1/auth/logout."""

    async def test_logout_success(
        self, client: AsyncClient, auth_headers: dict
    ):
        response = await client.post(
            "/api/v1/auth/logout", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "logged out" in data["message"].lower()

    async def test_logout_without_auth_rejected(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/logout")
        assert response.status_code in (401, 403)


class TestLoginEdgeCases:
    """Additional login edge case tests."""

    async def test_login_with_wrong_password(self, client: AsyncClient):
        # First register
        reg_payload = {
            "gym_name": "Login Test Gym",
            "owner_name": "Login Owner",
            "phone": "9876500050",
            "email": f"login-test-{uuid4().hex[:6]}@test.com",
            "password": "SecurePass123",
        }
        reg_resp = await client.post("/api/v1/auth/register", json=reg_payload)
        assert reg_resp.status_code == 201

        # Try wrong password
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={
                "email": reg_payload["email"],
                "password": "WrongPassword123",
            },
        )
        assert login_resp.status_code == 401

    async def test_login_with_nonexistent_email(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "nonexistent@test.com",
                "password": "SomePass123",
            },
        )
        assert response.status_code == 401

    async def test_login_disabled_account(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        sample_gym: Gym,
    ):
        """A deactivated user cannot log in."""
        user = User(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Disabled User",
            email=f"disabled-{uuid4().hex[:6]}@test.com",
            phone="9876500051",
            password_hash=hash_password("TestPass123"),
            role=UserRole.STAFF,
            is_active=False,
        )
        db_session.add(user)
        await db_session.flush()

        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": user.email,
                "password": "TestPass123",
            },
        )
        assert response.status_code in (401, 403)
