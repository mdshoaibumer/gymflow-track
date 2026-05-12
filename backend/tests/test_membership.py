"""
Tests for Membership lifecycle service.

Coverage:
1. compute_status — derive status from dates
2. sync_member_status — auto-correct drifted status
3. renew_membership — extend membership, transition to ACTIVE
4. freeze_membership — manual freeze
5. cancel_membership — permanent cancellation
6. get_expiring_members — members expiring within N days
7. Edge cases — no end date, frozen/cancelled members
"""

from datetime import date, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.services.membership_service import MembershipService


# === Fixtures ===


@pytest.fixture
async def membership_service(db_session: AsyncSession) -> MembershipService:
    return MembershipService(db_session)


@pytest.fixture
async def active_member(db_session: AsyncSession, sample_gym: Gym) -> Member:
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Active Member",
        phone="9500000001",
        membership_status=MembershipStatus.ACTIVE,
        membership_start=date.today() - timedelta(days=15),
        membership_end=date.today() + timedelta(days=15),
        membership_plan="Monthly",
        amount_paid=150000,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def expired_member(db_session: AsyncSession, sample_gym: Gym) -> Member:
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Expired Member",
        phone="9500000002",
        membership_status=MembershipStatus.ACTIVE,  # status not synced yet
        membership_start=date.today() - timedelta(days=60),
        membership_end=date.today() - timedelta(days=5),
        membership_plan="Monthly",
        amount_paid=150000,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def pending_member(db_session: AsyncSession, sample_gym: Gym) -> Member:
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Pending Member",
        phone="9500000003",
        membership_status=MembershipStatus.PENDING,
        membership_plan="Monthly",
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def frozen_member(db_session: AsyncSession, sample_gym: Gym) -> Member:
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Frozen Member",
        phone="9500000004",
        membership_status=MembershipStatus.FROZEN,
        membership_start=date.today() - timedelta(days=30),
        membership_end=date.today() + timedelta(days=30),
        membership_plan="Monthly",
        amount_paid=150000,
    )
    db_session.add(member)
    await db_session.flush()
    return member


class TestComputeStatus:
    """Test MembershipService.compute_status()."""

    async def test_active_member_returns_active(
        self, membership_service: MembershipService, active_member: Member
    ):
        status = membership_service.compute_status(active_member)
        assert status == MembershipStatus.ACTIVE

    async def test_expired_member_returns_expired(
        self, membership_service: MembershipService, expired_member: Member
    ):
        status = membership_service.compute_status(expired_member)
        assert status == MembershipStatus.EXPIRED

    async def test_no_end_date_returns_pending(
        self, membership_service: MembershipService, pending_member: Member
    ):
        status = membership_service.compute_status(pending_member)
        assert status == MembershipStatus.PENDING

    async def test_frozen_member_stays_frozen(
        self, membership_service: MembershipService, frozen_member: Member
    ):
        """Frozen status is a manual override — compute_status preserves it."""
        status = membership_service.compute_status(frozen_member)
        assert status == MembershipStatus.FROZEN

    async def test_cancelled_member_stays_cancelled(
        self,
        membership_service: MembershipService,
        db_session: AsyncSession,
        sample_gym: Gym,
    ):
        member = Member(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Cancelled",
            phone="9500000005",
            membership_status=MembershipStatus.CANCELLED,
            membership_end=date.today() + timedelta(days=10),
            amount_paid=0,
        )
        db_session.add(member)
        await db_session.flush()

        status = membership_service.compute_status(member)
        assert status == MembershipStatus.CANCELLED


class TestSyncMemberStatus:
    """Test MembershipService.sync_member_status()."""

    async def test_corrects_expired_member(
        self, membership_service: MembershipService, expired_member: Member
    ):
        """Member with past end date but ACTIVE status → should sync to EXPIRED."""
        assert expired_member.membership_status == MembershipStatus.ACTIVE
        updated = await membership_service.sync_member_status(expired_member)
        assert updated.membership_status == MembershipStatus.EXPIRED

    async def test_active_member_unchanged(
        self, membership_service: MembershipService, active_member: Member
    ):
        updated = await membership_service.sync_member_status(active_member)
        assert updated.membership_status == MembershipStatus.ACTIVE


class TestRenewMembership:
    """Test MembershipService.renew_membership()."""

    async def test_renew_sets_new_end_date(
        self, membership_service: MembershipService, active_member: Member
    ):
        new_end = date.today() + timedelta(days=60)
        updated = await membership_service.renew_membership(
            active_member, new_end=new_end
        )
        assert updated.membership_end == new_end
        assert updated.membership_status == MembershipStatus.ACTIVE

    async def test_renew_expired_member_reactivates(
        self, membership_service: MembershipService, expired_member: Member
    ):
        new_end = date.today() + timedelta(days=30)
        updated = await membership_service.renew_membership(
            expired_member, new_end=new_end
        )
        assert updated.membership_status == MembershipStatus.ACTIVE
        assert updated.membership_end == new_end

    async def test_renew_with_plan_change(
        self, membership_service: MembershipService, active_member: Member
    ):
        new_end = date.today() + timedelta(days=90)
        updated = await membership_service.renew_membership(
            active_member, new_end=new_end, plan="Quarterly"
        )
        assert updated.membership_plan == "Quarterly"

    async def test_renew_with_start_date(
        self, membership_service: MembershipService, active_member: Member
    ):
        new_start = date.today()
        new_end = date.today() + timedelta(days=30)
        updated = await membership_service.renew_membership(
            active_member, new_end=new_end, new_start=new_start
        )
        assert updated.membership_start == new_start


class TestFreezeMembership:
    """Test MembershipService.freeze_membership()."""

    async def test_freeze_active_member(
        self, membership_service: MembershipService, active_member: Member
    ):
        updated = await membership_service.freeze_membership(active_member)
        assert updated.membership_status == MembershipStatus.FROZEN


class TestCancelMembership:
    """Test MembershipService.cancel_membership()."""

    async def test_cancel_active_member(
        self, membership_service: MembershipService, active_member: Member
    ):
        updated = await membership_service.cancel_membership(active_member)
        assert updated.membership_status == MembershipStatus.CANCELLED


class TestGetExpiringMembers:
    """Test MembershipService.get_expiring_members()."""

    async def test_finds_expiring_members(
        self,
        membership_service: MembershipService,
        db_session: AsyncSession,
        sample_gym: Gym,
    ):
        # Create a member expiring in 5 days
        member = Member(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Expiring Soon",
            phone="9500000010",
            membership_status=MembershipStatus.ACTIVE,
            membership_start=date.today() - timedelta(days=25),
            membership_end=date.today() + timedelta(days=5),
            membership_plan="Monthly",
            amount_paid=150000,
        )
        db_session.add(member)
        await db_session.flush()

        result = await membership_service.get_expiring_members(
            sample_gym.id, within_days=7
        )
        names = [m.name for m in result]
        assert "Expiring Soon" in names

    async def test_does_not_include_distant_expiry(
        self,
        membership_service: MembershipService,
        active_member: Member,
        sample_gym: Gym,
    ):
        """Member expiring in 15 days should NOT appear in 7-day window."""
        result = await membership_service.get_expiring_members(
            sample_gym.id, within_days=7
        )
        names = [m.name for m in result]
        assert "Active Member" not in names
