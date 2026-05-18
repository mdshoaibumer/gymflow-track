"""
Tests for app.core.security — JWT token and password hashing.

Coverage:
1. hash_password and verify_password
2. create_access_token — claims, expiry, gym_id handling
3. create_refresh_token — type distinction, longer expiry
4. decode_token — valid tokens, expired tokens, invalid tokens
5. Token uniqueness (jti)
"""

from datetime import datetime, timezone, timedelta
from uuid import uuid4, UUID

import pytest
import jwt as pyjwt

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    """Password hashing and verification."""

    def test_hash_returns_string(self):
        hashed = hash_password("TestPass123")
        assert isinstance(hashed, str)
        assert hashed != "TestPass123"

    def test_hash_uses_bcrypt(self):
        hashed = hash_password("MyPassword1")
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")

    def test_verify_correct_password(self):
        hashed = hash_password("Correct1Pass")
        assert verify_password("Correct1Pass", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("Correct1Pass")
        assert verify_password("WrongPass1", hashed) is False

    def test_different_hashes_for_same_password(self):
        """Salt ensures unique hashes each time."""
        h1 = hash_password("SamePass1")
        h2 = hash_password("SamePass1")
        assert h1 != h2

    def test_empty_password_still_hashes(self):
        hashed = hash_password("")
        assert isinstance(hashed, str)
        assert verify_password("", hashed) is True


class TestCreateAccessToken:
    """Access token creation and claims."""

    def test_returns_string(self):
        token = create_access_token(uuid4(), uuid4(), "owner")
        assert isinstance(token, str)

    def test_contains_correct_claims(self):
        user_id = uuid4()
        gym_id = uuid4()
        token = create_access_token(user_id, gym_id, "owner")
        payload = pyjwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

        assert payload["sub"] == str(user_id)
        assert payload["gym_id"] == str(gym_id)
        assert payload["role"] == "owner"
        assert payload["type"] == "access"
        assert "jti" in payload
        assert "iat" in payload
        assert "exp" in payload

    def test_super_admin_no_gym_id(self):
        """Super admins have gym_id=None, which is omitted from JWT."""
        user_id = uuid4()
        token = create_access_token(user_id, None, "super_admin")
        payload = pyjwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

        assert "gym_id" not in payload
        assert payload["role"] == "super_admin"

    def test_expiry_is_correct(self):
        token = create_access_token(uuid4(), uuid4(), "staff")
        payload = pyjwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        diff = (exp - iat).total_seconds() / 60
        assert abs(diff - settings.ACCESS_TOKEN_EXPIRE_MINUTES) < 1

    def test_jti_is_unique(self):
        """Each token gets a unique jti."""
        t1 = create_access_token(uuid4(), uuid4(), "owner")
        t2 = create_access_token(uuid4(), uuid4(), "owner")
        p1 = pyjwt.decode(t1, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        p2 = pyjwt.decode(t2, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        assert p1["jti"] != p2["jti"]


class TestCreateRefreshToken:
    """Refresh token creation."""

    def test_type_is_refresh(self):
        token = create_refresh_token(uuid4(), uuid4(), "owner")
        payload = pyjwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        assert payload["type"] == "refresh"

    def test_longer_expiry_than_access(self):
        token = create_refresh_token(uuid4(), uuid4(), "owner")
        payload = pyjwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        diff_days = (exp - iat).days
        assert diff_days == settings.REFRESH_TOKEN_EXPIRE_DAYS

    def test_contains_role(self):
        token = create_refresh_token(uuid4(), uuid4(), "admin")
        payload = pyjwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        assert payload["role"] == "admin"


class TestDecodeToken:
    """Token decoding and validation."""

    def test_valid_token_decoded(self):
        token = create_access_token(uuid4(), uuid4(), "owner")
        payload = decode_token(token)
        assert payload is not None
        assert payload["type"] == "access"

    def test_invalid_token_returns_none(self):
        result = decode_token("invalid.token.here")
        assert result is None

    def test_wrong_secret_returns_none(self):
        """Token signed with wrong secret fails."""
        payload = {"sub": str(uuid4()), "type": "access", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
        token = pyjwt.encode(payload, "wrong-secret", algorithm="HS256")
        assert decode_token(token) is None

    def test_expired_token_returns_none(self):
        """Expired tokens fail decoding."""
        payload = {
            "sub": str(uuid4()),
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "iat": datetime.now(timezone.utc) - timedelta(hours=2),
        }
        token = pyjwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        assert decode_token(token) is None

    def test_empty_string_returns_none(self):
        assert decode_token("") is None

    def test_malformed_base64_returns_none(self):
        assert decode_token("not.valid.jwt!!!") is None
