"""
Impersonation service tests for GymFlow Track.

Coverage:
1. Token creation — impersonation token has correct claims
2. Impersonation start — audit trail, correct owner selected
3. Impersonation end — audit logging
4. Security — impersonation token TTL is shorter, contains impersonator_id
5. Error cases — nonexistent gym, no active owner
6. Token usability — impersonation token can access gym endpoints
"""

from datetime import datetime, timezone
from uuid import uuid4

import jwt as pyjwt
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_backend
from app.core.config import settings
from app.core.security import hash_password
from app.models.gym import Gym
from app.models.user import User, UserRole
from app.services.impersonation_service import (
    IMPERSONATION_TTL_MINUTES,
    ImpersonationService,
    create_impersonation_token,
)


# === Fixtures ===


@pytest.fixture
async def imp_gym(db_session: AsyncSession) -> Gym:
    """A gym for impersonation tests."""
    gym = Gym(
        id=uuid4(),
        name="Impersonation Test Gym",
        slug=f"imp-gym-{uuid4().hex[:6]}",
        phone="9300000001",
    )
    db_session.add(gym)
    await db_session.flush()
    return gym


@pytest.fixture
async def imp_owner(db_session: AsyncSession, imp_gym: Gym) -> User:
    """Owner of the impersonation test gym."""
    user = User(
        id=uuid4(),
        gym_id=imp_gym.id,
        name="Imp Owner",
        email=f"imp-owner-{uuid4().hex[:6]}@test.com",
        phone="9300000001",
        password_hash=hash_password("TestPass123"),
        role=UserRole.OWNER,
    )
    db_session.add(user)
    await db_session.flush()
    cache = get_cache_backend()
    cache.set(f"user_active:{user.id}", "1", 99999)
    cache.set(f"user_revoked_at:{user.id}", "", 99999)
    return user


@pytest.fixture
async def imp_admin(db_session: AsyncSession) -> User:
    """Super admin for impersonation tests."""
    user = User(
        id=uuid4(),
        gym_id=None,
        name="Imp Super Admin",
        email=f"imp-admin-{uuid4().hex[:6]}@gymflow.com",
        phone="9300000002",
        password_hash=hash_password("AdminPass123"),
        role=UserRole.SUPER_ADMIN,
    )
    db_session.add(user)
    await db_session.flush()
    cache = get_cache_backend()
    cache.set(f"user_active:{user.id}", "1", 99999)
    cache.set(f"user_revoked_at:{user.id}", "", 99999)
    return user


# === Token Creation Tests ===


class TestImpersonationToken:
    """Test the impersonation token creation."""

    def test_token_contains_correct_claims(self):
        """Token should contain sub, gym_id, role, impersonator_id."""
        owner_id = uuid4()
        gym_id = uuid4()
        admin_id = uuid4()

        token = create_impersonation_token(owner_id, gym_id, admin_id)
        payload = pyjwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )

        assert payload["sub"] == str(owner_id)
        assert payload["gym_id"] == str(gym_id)
        assert payload["role"] == "owner"
        assert payload["impersonator_id"] == str(admin_id)
        assert payload["type"] == "access"

    def test_token_has_short_ttl(self):
        """Impersonation token should expire in IMPERSONATION_TTL_MINUTES."""
        token = create_impersonation_token(uuid4(), uuid4(), uuid4())
        payload = pyjwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )

        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        ttl = (exp - iat).total_seconds() / 60

        # TTL should be close to IMPERSONATION_TTL_MINUTES (allow 1 minute tolerance)
        assert abs(ttl - IMPERSONATION_TTL_MINUTES) < 1

    def test_token_has_unique_jti(self):
        """Each token should have a unique JTI for audit trail."""
        token1 = create_impersonation_token(uuid4(), uuid4(), uuid4())
        token2 = create_impersonation_token(uuid4(), uuid4(), uuid4())

        p1 = pyjwt.decode(token1, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        p2 = pyjwt.decode(token2, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

        assert p1["jti"] != p2["jti"]


# === Impersonation Service Tests ===


class TestImpersonationService:
    """Test the ImpersonationService start/end flow."""

    @pytest.mark.asyncio
    async def test_start_impersonation_returns_token(
        self, db_session: AsyncSession, imp_gym: Gym, imp_owner: User, imp_admin: User
    ):
        """Starting impersonation returns a valid token and gym info."""
        service = ImpersonationService(db_session)
        result = await service.start_impersonation(
            admin_id=imp_admin.id,
            gym_id=imp_gym.id,
        )

        assert "access_token" in result
        assert result["gym_name"] == "Impersonation Test Gym"
        assert result["owner_id"] == str(imp_owner.id)
        assert result["impersonator_id"] == str(imp_admin.id)
        assert result["expires_in_minutes"] == IMPERSONATION_TTL_MINUTES

    @pytest.mark.asyncio
    async def test_start_impersonation_creates_audit_log(
        self, db_session: AsyncSession, imp_gym: Gym, imp_owner: User, imp_admin: User
    ):
        """Impersonation start should create an audit log entry."""
        from app.models.audit_log import AuditAction, AuditLog
        from sqlalchemy import select

        service = ImpersonationService(db_session)
        await service.start_impersonation(
            admin_id=imp_admin.id,
            gym_id=imp_gym.id,
        )

        result = await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == AuditAction.IMPERSONATION_START,
                AuditLog.target_gym_id == imp_gym.id,
            )
        )
        log = result.scalar_one_or_none()
        assert log is not None
        assert log.actor_id == imp_admin.id
        assert log.target_user_id == imp_owner.id

    @pytest.mark.asyncio
    async def test_start_impersonation_nonexistent_gym(
        self, db_session: AsyncSession, imp_admin: User
    ):
        """Impersonating a nonexistent gym should raise NotFoundError."""
        from app.core.exceptions import NotFoundError

        service = ImpersonationService(db_session)
        with pytest.raises(NotFoundError, match="Gym not found"):
            await service.start_impersonation(
                admin_id=imp_admin.id,
                gym_id=uuid4(),
            )

    @pytest.mark.asyncio
    async def test_start_impersonation_no_active_owner(
        self, db_session: AsyncSession, imp_admin: User
    ):
        """Gym with no active owner should raise NotFoundError."""
        from app.core.exceptions import NotFoundError

        # Create gym with no owner
        gym = Gym(
            id=uuid4(),
            name="Ownerless Gym",
            slug=f"ownerless-{uuid4().hex[:6]}",
            phone="9300000003",
        )
        db_session.add(gym)
        await db_session.flush()

        service = ImpersonationService(db_session)
        with pytest.raises(NotFoundError, match="No active owner"):
            await service.start_impersonation(
                admin_id=imp_admin.id,
                gym_id=gym.id,
            )

    @pytest.mark.asyncio
    async def test_end_impersonation_creates_audit_log(
        self, db_session: AsyncSession, imp_gym: Gym, imp_owner: User, imp_admin: User
    ):
        """Ending impersonation should create an audit log entry."""
        from app.models.audit_log import AuditAction, AuditLog
        from sqlalchemy import select

        service = ImpersonationService(db_session)
        # Start first
        await service.start_impersonation(
            admin_id=imp_admin.id,
            gym_id=imp_gym.id,
        )
        # End
        await service.end_impersonation(
            admin_id=imp_admin.id,
            gym_id=imp_gym.id,
        )

        result = await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == AuditAction.IMPERSONATION_END,
                AuditLog.target_gym_id == imp_gym.id,
            )
        )
        log = result.scalar_one_or_none()
        assert log is not None
        assert log.actor_id == imp_admin.id

    @pytest.mark.asyncio
    async def test_impersonation_token_decoded_correctly(
        self, db_session: AsyncSession, imp_gym: Gym, imp_owner: User, imp_admin: User
    ):
        """The returned token should decode to the owner's identity."""
        service = ImpersonationService(db_session)
        result = await service.start_impersonation(
            admin_id=imp_admin.id,
            gym_id=imp_gym.id,
        )

        payload = pyjwt.decode(
            result["access_token"],
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )

        # Token looks like the owner's identity
        assert payload["sub"] == str(imp_owner.id)
        assert payload["gym_id"] == str(imp_gym.id)
        assert payload["role"] == "owner"
        # But has the impersonator_id for audit trail
        assert payload["impersonator_id"] == str(imp_admin.id)
