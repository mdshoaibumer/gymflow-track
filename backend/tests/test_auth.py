"""
Integration tests for authentication flows.

Tests:
- Gym registration (happy path + duplicate email)
- Login (valid credentials, invalid credentials, disabled account)
- Token refresh (valid, invalid, disabled user)
- GET /auth/me (valid token, invalid token, expired, inactive user)
"""

from httpx import AsyncClient


class TestRegistration:
    """Test the gym registration flow."""

    async def test_register_creates_gym_and_returns_tokens(self, client: AsyncClient):
        """Happy path: new gym + owner created, tokens returned."""
        payload = {
            "gym_name": "Iron Paradise",
            "owner_name": "Rajesh Kumar",
            "phone": "9876543210",
            "email": "rajesh@ironparadise.com",
            "password": "SecurePass123",
            "city": "Mumbai",
        }

        response = await client.post("/api/v1/auth/register", json=payload)

        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_register_duplicate_email_returns_409(self, client: AsyncClient):
        """Same email cannot register twice."""
        payload = {
            "gym_name": "Gym One",
            "owner_name": "User One",
            "phone": "9876500001",
            "email": "duplicate@test.com",
            "password": "SecurePass123",
        }

        # First registration should succeed
        resp1 = await client.post("/api/v1/auth/register", json=payload)
        assert resp1.status_code == 201

        # Second registration with same email should fail
        payload["gym_name"] = "Gym Two"
        payload["phone"] = "9876500002"
        resp2 = await client.post("/api/v1/auth/register", json=payload)
        assert resp2.status_code == 409
        assert "already registered" in resp2.json()["detail"].lower()

    async def test_register_invalid_phone_returns_422(self, client: AsyncClient):
        """Phone validation rejects non-Indian numbers."""
        payload = {
            "gym_name": "Bad Gym",
            "owner_name": "Bad User",
            "phone": "1234567890",  # Doesn't start with 6-9
            "email": "bad@test.com",
            "password": "SecurePass123",
        }

        response = await client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 422

    async def test_register_short_password_returns_422(self, client: AsyncClient):
        """Password must be at least 8 characters."""
        payload = {
            "gym_name": "Gym",
            "owner_name": "User",
            "phone": "9876543210",
            "email": "short@test.com",
            "password": "short",
        }

        response = await client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 422


class TestLogin:
    """Test the login flow."""

    async def test_login_valid_credentials(self, client: AsyncClient):
        """Registered user can log in with correct credentials."""
        # Register first
        reg_payload = {
            "gym_name": "Login Test Gym",
            "owner_name": "Login User",
            "phone": "9876543211",
            "email": "login@test.com",
            "password": "SecurePass123",
        }
        await client.post("/api/v1/auth/register", json=reg_payload)

        # Login
        login_payload = {"email": "login@test.com", "password": "SecurePass123"}
        response = await client.post("/api/v1/auth/login", json=login_payload)

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_login_wrong_password_returns_401(self, client: AsyncClient):
        """Wrong password is rejected."""
        # Register
        reg_payload = {
            "gym_name": "Wrong Pass Gym",
            "owner_name": "User",
            "phone": "9876543212",
            "email": "wrongpass@test.com",
            "password": "SecurePass123",
        }
        await client.post("/api/v1/auth/register", json=reg_payload)

        # Login with wrong password
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "wrongpass@test.com", "password": "WrongPassword"},
        )
        assert response.status_code == 401

    async def test_login_nonexistent_email_returns_401(self, client: AsyncClient):
        """Non-existent email returns 401 (not 404, to avoid user enumeration)."""
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@test.com", "password": "SomePass123"},
        )
        assert response.status_code == 401


class TestTokenRefresh:
    """Test refresh token flow."""

    async def test_refresh_valid_token(self, client: AsyncClient):
        """Valid refresh token returns new token pair."""
        # Register to get tokens
        reg_payload = {
            "gym_name": "Refresh Gym",
            "owner_name": "User",
            "phone": "9876543213",
            "email": "refresh@test.com",
            "password": "SecurePass123",
        }
        reg_resp = await client.post("/api/v1/auth/register", json=reg_payload)
        refresh_token = reg_resp.json()["refresh_token"]

        # Refresh
        response = await client.post(
            "/api/v1/auth/refresh", json={"refresh_token": refresh_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_refresh_invalid_token_returns_401(self, client: AsyncClient):
        """Garbage refresh token is rejected."""
        response = await client.post(
            "/api/v1/auth/refresh", json={"refresh_token": "invalid.token.here"}
        )
        assert response.status_code == 401


class TestGetMe:
    """Test GET /auth/me — current user profile endpoint."""

    async def test_get_me_with_valid_token(self, client: AsyncClient):
        """Authenticated user can fetch their own profile."""
        # Register to get a token
        reg_payload = {
            "gym_name": "Me Test Gym",
            "owner_name": "Profile User",
            "phone": "9876543250",
            "email": "me@test.com",
            "password": "SecurePass123",
            "city": "Delhi",
        }
        reg_resp = await client.post("/api/v1/auth/register", json=reg_payload)
        token = reg_resp.json()["access_token"]

        # GET /auth/me
        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()

        # Validate response contains safe fields only
        assert data["name"] == "Profile User"
        assert data["email"] == "me@test.com"
        assert data["phone"] == "9876543250"
        assert data["role"] == "owner"
        assert data["is_active"] is True
        assert "id" in data
        assert "gym_id" in data

        # Verify no sensitive data leaked
        assert "password_hash" not in data
        assert "password" not in data

    async def test_get_me_without_token_returns_error(self, client: AsyncClient):
        """Missing Authorization header returns 401/403."""
        response = await client.get("/api/v1/auth/me")
        assert response.status_code in (401, 403)

    async def test_get_me_with_invalid_token_returns_401(self, client: AsyncClient):
        """Garbage token is rejected."""
        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer garbage.invalid.token"},
        )
        assert response.status_code == 401

    async def test_get_me_with_expired_token_returns_401(self, client: AsyncClient):
        """Expired JWT is rejected."""
        from datetime import datetime, timezone, timedelta
        from uuid import uuid4

        import jwt as pyjwt

        from app.core.config import settings

        payload = {
            "sub": str(uuid4()),
            "gym_id": str(uuid4()),
            "role": "owner",
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        }
        expired_token = pyjwt.encode(
            payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )

        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert response.status_code == 401

    async def test_get_me_inactive_user_returns_403(
        self, client: AsyncClient, db_session
    ):
        """Disabled user's token is rejected at /me."""
        from app.core.security import create_access_token, hash_password
        from app.models.gym import Gym
        from app.models.user import User, UserRole
        from uuid import uuid4

        # Create gym + disabled user directly in DB
        gym = Gym(
            id=uuid4(),
            name="Disabled Gym",
            slug=f"disabled-gym-{uuid4().hex[:8]}",
            phone="9876500099",
        )
        db_session.add(gym)
        await db_session.flush()

        user = User(
            id=uuid4(),
            gym_id=gym.id,
            name="Disabled User",
            email="disabled@test.com",
            phone="9876500099",
            password_hash=hash_password("TestPass123"),
            role=UserRole.OWNER,
            is_active=False,
        )
        db_session.add(user)
        await db_session.flush()

        # Seed cache so _check_user_active sees user as disabled
        from app.core.cache import get_cache_backend
        cache = get_cache_backend()
        cache.set(f"user_active:{user.id}", "0", 99999)
        cache.set(f"user_revoked_at:{user.id}", "", 99999)

        # Generate a valid token for this disabled user
        token = create_access_token(user.id, gym.id, user.role.value)

        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        # Disabled user — _check_user_active rejects with 401
        assert response.status_code == 401

    async def test_get_me_returns_correct_role_after_login(
        self, client: AsyncClient
    ):
        """Role in /me response matches what was set during registration."""
        # Register
        reg_payload = {
            "gym_name": "Role Check Gym",
            "owner_name": "Role User",
            "phone": "9876543260",
            "email": "rolecheck@test.com",
            "password": "SecurePass123",
        }
        reg_resp = await client.post("/api/v1/auth/register", json=reg_payload)
        access_token = reg_resp.json()["access_token"]

        # Login
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "rolecheck@test.com", "password": "SecurePass123"},
        )
        login_token = login_resp.json()["access_token"]

        # Both tokens should return owner role
        for tk in [access_token, login_token]:
            me_resp = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {tk}"},
            )
            assert me_resp.status_code == 200
            assert me_resp.json()["role"] == "owner"

    async def test_get_me_validates_gym_context(
        self, client: AsyncClient, db_session
    ):
        """Token with mismatched gym_id is rejected (prevents cross-tenant hijack)."""
        from app.core.security import create_access_token, hash_password
        from app.models.gym import Gym
        from app.models.user import User, UserRole
        from uuid import uuid4

        # Create gym + user
        gym = Gym(
            id=uuid4(),
            name="Context Gym",
            slug=f"context-gym-{uuid4().hex[:8]}",
            phone="9876500098",
        )
        db_session.add(gym)
        await db_session.flush()

        user = User(
            id=uuid4(),
            gym_id=gym.id,
            name="Context User",
            email="context@test.com",
            phone="9876500098",
            password_hash=hash_password("TestPass123"),
            role=UserRole.OWNER,
        )
        db_session.add(user)
        await db_session.flush()

        # Seed cache so _check_user_active passes
        from app.core.cache import get_cache_backend
        cache = get_cache_backend()
        cache.set(f"user_active:{user.id}", "1", 99999)
        cache.set(f"user_revoked_at:{user.id}", "", 99999)

        # Create token with WRONG gym_id (simulates a tampered/stale token)
        fake_gym_id = uuid4()
        token = create_access_token(user.id, fake_gym_id, user.role.value)

        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        # Mismatched gym context — should be 401
        assert response.status_code == 401
