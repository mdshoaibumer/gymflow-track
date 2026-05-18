"""
Tests for app.core.billing_dependencies — subscription feature gates.

Coverage:
1. Early access mode (ENABLE_BILLING_ENFORCEMENT=False) bypasses all checks
2. require_active_subscription — locked, read_only, active
3. require_member_capacity — limit enforcement
4. require_staff_capacity — staff limit
5. Super admin bypass
"""

import asyncio

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4

from app.core.billing_dependencies import (
    ENABLE_BILLING_ENFORCEMENT,
    require_active_subscription,
    require_member_capacity,
    require_staff_capacity,
)
from app.core.dependencies import CurrentUser
from app.models.user import UserRole


def _run(coro):
    """Helper to run an async function synchronously in tests."""
    return asyncio.run(coro)


class TestEarlyAccessMode:
    """All gates bypass when ENABLE_BILLING_ENFORCEMENT is False."""

    def test_billing_enforcement_disabled_by_default(self):
        """Early access mode is enabled (enforcement disabled)."""
        assert ENABLE_BILLING_ENFORCEMENT is False

    def test_active_subscription_bypassed(self):
        """require_active_subscription returns user without checks."""
        user = CurrentUser(uuid4(), uuid4(), UserRole.OWNER)
        with patch("app.core.billing_dependencies.ENABLE_BILLING_ENFORCEMENT", False):
            result = _run(require_active_subscription(current_user=user, db=AsyncMock()))
        assert result is user

    def test_member_capacity_bypassed(self):
        """require_member_capacity returns user without checks."""
        user = CurrentUser(uuid4(), uuid4(), UserRole.OWNER)
        with patch("app.core.billing_dependencies.ENABLE_BILLING_ENFORCEMENT", False):
            result = _run(require_member_capacity(current_user=user, db=AsyncMock()))
        assert result is user

    def test_staff_capacity_bypassed(self):
        """require_staff_capacity returns user without checks."""
        user = CurrentUser(uuid4(), uuid4(), UserRole.OWNER)
        with patch("app.core.billing_dependencies.ENABLE_BILLING_ENFORCEMENT", False):
            result = _run(require_staff_capacity(current_user=user, db=AsyncMock()))
        assert result is user


class TestSuperAdminBypass:
    """Super admin skips all subscription checks."""

    def test_super_admin_bypasses_subscription(self):
        user = CurrentUser(uuid4(), None, UserRole.SUPER_ADMIN)
        with patch("app.core.billing_dependencies.ENABLE_BILLING_ENFORCEMENT", True):
            result = _run(require_active_subscription(current_user=user, db=AsyncMock()))
        assert result is user

    def test_super_admin_bypasses_member_capacity(self):
        user = CurrentUser(uuid4(), None, UserRole.SUPER_ADMIN)
        with patch("app.core.billing_dependencies.ENABLE_BILLING_ENFORCEMENT", True):
            result = _run(require_member_capacity(current_user=user, db=AsyncMock()))
        assert result is user

    def test_super_admin_bypasses_staff_capacity(self):
        user = CurrentUser(uuid4(), None, UserRole.SUPER_ADMIN)
        with patch("app.core.billing_dependencies.ENABLE_BILLING_ENFORCEMENT", True):
            result = _run(require_staff_capacity(current_user=user, db=AsyncMock()))
        assert result is user


class TestActiveSubscriptionEnforcement:
    """require_active_subscription when billing is enforced."""

    def test_locked_gym_raises_403(self):
        from fastapi import HTTPException
        user = CurrentUser(uuid4(), uuid4(), UserRole.OWNER)
        mock_db = AsyncMock()

        with patch("app.core.billing_dependencies.ENABLE_BILLING_ENFORCEMENT", True), \
             patch("app.core.billing_dependencies.get_subscription", return_value=MagicMock()), \
             patch("app.core.billing_dependencies.get_access_level", return_value="locked"):
            with pytest.raises(HTTPException) as exc_info:
                _run(require_active_subscription(current_user=user, db=mock_db))
            assert exc_info.value.status_code == 403
            assert "expired" in exc_info.value.detail

    def test_read_only_gym_raises_403(self):
        from fastapi import HTTPException
        user = CurrentUser(uuid4(), uuid4(), UserRole.OWNER)
        mock_db = AsyncMock()

        with patch("app.core.billing_dependencies.ENABLE_BILLING_ENFORCEMENT", True), \
             patch("app.core.billing_dependencies.get_subscription", return_value=MagicMock()), \
             patch("app.core.billing_dependencies.get_access_level", return_value="read_only"):
            with pytest.raises(HTTPException) as exc_info:
                _run(require_active_subscription(current_user=user, db=mock_db))
            assert exc_info.value.status_code == 403
            assert "inactive" in exc_info.value.detail

    def test_active_gym_passes(self):
        user = CurrentUser(uuid4(), uuid4(), UserRole.OWNER)
        mock_db = AsyncMock()

        with patch("app.core.billing_dependencies.ENABLE_BILLING_ENFORCEMENT", True), \
             patch("app.core.billing_dependencies.get_subscription", return_value=MagicMock()), \
             patch("app.core.billing_dependencies.get_access_level", return_value="full"):
            result = _run(require_active_subscription(current_user=user, db=mock_db))
            assert result is user


class TestMemberCapacityEnforcement:
    """require_member_capacity when billing is enforced."""

    def test_over_limit_raises_403(self):
        from fastapi import HTTPException
        user = CurrentUser(uuid4(), uuid4(), UserRole.OWNER)
        mock_db = AsyncMock()

        with patch("app.core.billing_dependencies.ENABLE_BILLING_ENFORCEMENT", True), \
             patch("app.core.billing_dependencies.check_member_limit", return_value={
                 "allowed": False,
                 "current_members": 100,
                 "max_members": 100,
             }):
            with pytest.raises(HTTPException) as exc_info:
                _run(require_member_capacity(current_user=user, db=mock_db))
            assert exc_info.value.status_code == 403
            assert "limit" in exc_info.value.detail.lower()

    def test_under_limit_passes(self):
        user = CurrentUser(uuid4(), uuid4(), UserRole.OWNER)
        mock_db = AsyncMock()

        with patch("app.core.billing_dependencies.ENABLE_BILLING_ENFORCEMENT", True), \
             patch("app.core.billing_dependencies.check_member_limit", return_value={
                 "allowed": True,
                 "current_members": 50,
                 "max_members": 100,
             }):
            result = _run(require_member_capacity(current_user=user, db=mock_db))
            assert result is user
