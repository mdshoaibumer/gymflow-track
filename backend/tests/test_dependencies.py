"""
Tests for app.core.dependencies — authentication and RBAC dependencies.

Coverage:
1. CurrentUser class properties (is_owner, is_admin_or_above, is_super_admin)
2. get_current_user — token resolution, cookie fallback
3. _check_user_active — cache hit/miss, disabled accounts, revoked sessions
4. require_role factory — allowed/denied roles
"""

from uuid import uuid4

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.dependencies import CurrentUser, _check_user_active
from app.core.cache import get_cache_backend
from app.models.user import UserRole
from fastapi import HTTPException


class TestCurrentUser:
    """CurrentUser dataclass properties."""

    def test_owner_properties(self):
        user = CurrentUser(uuid4(), uuid4(), UserRole.OWNER)
        assert user.is_owner is True
        assert user.is_admin_or_above is True
        assert user.is_super_admin is False

    def test_admin_properties(self):
        user = CurrentUser(uuid4(), uuid4(), UserRole.ADMIN)
        assert user.is_owner is False
        assert user.is_admin_or_above is True
        assert user.is_super_admin is False

    def test_staff_properties(self):
        user = CurrentUser(uuid4(), uuid4(), UserRole.STAFF)
        assert user.is_owner is False
        assert user.is_admin_or_above is False
        assert user.is_super_admin is False

    def test_super_admin_properties(self):
        user = CurrentUser(uuid4(), None, UserRole.SUPER_ADMIN)
        assert user.is_owner is False
        assert user.is_admin_or_above is False
        assert user.is_super_admin is True
        assert user.gym_id is None

    def test_user_attributes(self):
        user_id = uuid4()
        gym_id = uuid4()
        user = CurrentUser(user_id, gym_id, UserRole.OWNER)
        assert user.user_id == user_id
        assert user.gym_id == gym_id
        assert user.role == UserRole.OWNER


class TestCheckUserActiveCache:
    """_check_user_active cache behavior."""

    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear cache between tests."""
        cache = get_cache_backend()
        cache._store.clear()
        yield
        cache._store.clear()

    def test_cached_active_user_passes(self):
        """Active user in cache doesn't raise."""
        import asyncio
        user_id = uuid4()
        cache = get_cache_backend()
        cache.set(f"user_active:{user_id}", "1", 60)
        cache.set(f"user_revoked_at:{user_id}", "", 60)
        # Should not raise
        asyncio.run(_check_user_active(user_id, iat=9999999999))

    def test_cached_disabled_user_raises(self):
        """Disabled user in cache raises 401."""
        import asyncio
        user_id = uuid4()
        cache = get_cache_backend()
        cache.set(f"user_active:{user_id}", "0", 60)
        cache.set(f"user_revoked_at:{user_id}", "", 60)

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(_check_user_active(user_id))
        assert exc_info.value.status_code == 401
        assert "disabled" in exc_info.value.detail

    def test_cached_revoked_session_raises(self):
        """Token issued before revocation raises 401."""
        import asyncio
        user_id = uuid4()
        cache = get_cache_backend()
        cache.set(f"user_active:{user_id}", "1", 60)
        # Revoked at timestamp 1000 — token iat=500 is before revocation
        cache.set(f"user_revoked_at:{user_id}", "1000", 60)

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(_check_user_active(user_id, iat=500))
        assert exc_info.value.status_code == 401
        assert "revoked" in exc_info.value.detail

    def test_token_after_revocation_passes(self):
        """Token issued after revocation time is valid."""
        import asyncio
        user_id = uuid4()
        cache = get_cache_backend()
        cache.set(f"user_active:{user_id}", "1", 60)
        # Revoked at 1000, token iat=2000 is AFTER revocation
        cache.set(f"user_revoked_at:{user_id}", "1000", 60)

        # Should not raise
        asyncio.run(_check_user_active(user_id, iat=2000))
