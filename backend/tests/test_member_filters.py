"""
Integration tests for member status and plan filtering.

Tests:
- GET /members?status=active returns only active members
- GET /members?status=expired returns only expired members
- GET /members?plan=<plan_name> returns only members on that plan
- Combined status + plan filter works
- Invalid/empty filters return all members
"""

from uuid import uuid4
from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gym import Gym
from app.models.member import Member, MembershipStatus


class TestMemberStatusFilter:
    """Test filtering members by membership_status."""

    async def _seed_members(self, db_session: AsyncSession, gym: Gym):
        """Create members with various statuses."""
        members = [
            Member(
                id=uuid4(),
                gym_id=gym.id,
                name="Active Alice",
                phone="9000000001",
                membership_status=MembershipStatus.ACTIVE,
                membership_plan="Monthly",
                membership_start=date.today(),
                membership_end=date.today() + timedelta(days=30),
            ),
            Member(
                id=uuid4(),
                gym_id=gym.id,
                name="Active Bob",
                phone="9000000002",
                membership_status=MembershipStatus.ACTIVE,
                membership_plan="Quarterly",
                membership_start=date.today(),
                membership_end=date.today() + timedelta(days=90),
            ),
            Member(
                id=uuid4(),
                gym_id=gym.id,
                name="Expired Eve",
                phone="9000000003",
                membership_status=MembershipStatus.EXPIRED,
                membership_plan="Monthly",
                membership_start=date.today() - timedelta(days=60),
                membership_end=date.today() - timedelta(days=30),
            ),
            Member(
                id=uuid4(),
                gym_id=gym.id,
                name="Frozen Frank",
                phone="9000000004",
                membership_status=MembershipStatus.FROZEN,
                membership_plan="Annual",
                membership_start=date.today() - timedelta(days=100),
                membership_end=date.today() + timedelta(days=265),
            ),
        ]
        for m in members:
            db_session.add(m)
        await db_session.flush()

    async def test_filter_by_active_status(
        self, client: AsyncClient, db_session: AsyncSession,
        sample_gym: Gym, auth_headers: dict,
    ):
        await self._seed_members(db_session, sample_gym)

        resp = await client.get(
            "/api/v1/members?status=active", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        names = {m["name"] for m in data["members"]}
        assert names == {"Active Alice", "Active Bob"}

    async def test_filter_by_expired_status(
        self, client: AsyncClient, db_session: AsyncSession,
        sample_gym: Gym, auth_headers: dict,
    ):
        await self._seed_members(db_session, sample_gym)

        resp = await client.get(
            "/api/v1/members?status=expired", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["members"][0]["name"] == "Expired Eve"

    async def test_filter_by_frozen_status(
        self, client: AsyncClient, db_session: AsyncSession,
        sample_gym: Gym, auth_headers: dict,
    ):
        await self._seed_members(db_session, sample_gym)

        resp = await client.get(
            "/api/v1/members?status=frozen", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["members"][0]["name"] == "Frozen Frank"

    async def test_no_status_filter_returns_all(
        self, client: AsyncClient, db_session: AsyncSession,
        sample_gym: Gym, auth_headers: dict,
    ):
        await self._seed_members(db_session, sample_gym)

        resp = await client.get("/api/v1/members", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 4


class TestMemberPlanFilter:
    """Test filtering members by membership_plan."""

    async def _seed_members(self, db_session: AsyncSession, gym: Gym):
        """Create members with various plans."""
        members = [
            Member(
                id=uuid4(),
                gym_id=gym.id,
                name="Monthly Mike",
                phone="9100000001",
                membership_status=MembershipStatus.ACTIVE,
                membership_plan="Monthly",
                membership_start=date.today(),
                membership_end=date.today() + timedelta(days=30),
            ),
            Member(
                id=uuid4(),
                gym_id=gym.id,
                name="Monthly Mary",
                phone="9100000002",
                membership_status=MembershipStatus.ACTIVE,
                membership_plan="Monthly",
                membership_start=date.today(),
                membership_end=date.today() + timedelta(days=30),
            ),
            Member(
                id=uuid4(),
                gym_id=gym.id,
                name="Annual Andy",
                phone="9100000003",
                membership_status=MembershipStatus.ACTIVE,
                membership_plan="Annual",
                membership_start=date.today(),
                membership_end=date.today() + timedelta(days=365),
            ),
        ]
        for m in members:
            db_session.add(m)
        await db_session.flush()

    async def test_filter_by_plan_monthly(
        self, client: AsyncClient, db_session: AsyncSession,
        sample_gym: Gym, auth_headers: dict,
    ):
        await self._seed_members(db_session, sample_gym)

        resp = await client.get(
            "/api/v1/members?plan=Monthly", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        names = {m["name"] for m in data["members"]}
        assert names == {"Monthly Mike", "Monthly Mary"}

    async def test_filter_by_plan_annual(
        self, client: AsyncClient, db_session: AsyncSession,
        sample_gym: Gym, auth_headers: dict,
    ):
        await self._seed_members(db_session, sample_gym)

        resp = await client.get(
            "/api/v1/members?plan=Annual", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["members"][0]["name"] == "Annual Andy"

    async def test_filter_by_nonexistent_plan_returns_empty(
        self, client: AsyncClient, db_session: AsyncSession,
        sample_gym: Gym, auth_headers: dict,
    ):
        await self._seed_members(db_session, sample_gym)

        resp = await client.get(
            "/api/v1/members?plan=NoSuchPlan", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["members"] == []


class TestMemberCombinedFilters:
    """Test combined status + plan + search filters."""

    async def _seed_members(self, db_session: AsyncSession, gym: Gym):
        members = [
            Member(
                id=uuid4(),
                gym_id=gym.id,
                name="Active Monthly",
                phone="9200000001",
                membership_status=MembershipStatus.ACTIVE,
                membership_plan="Monthly",
                membership_start=date.today(),
                membership_end=date.today() + timedelta(days=30),
            ),
            Member(
                id=uuid4(),
                gym_id=gym.id,
                name="Expired Monthly",
                phone="9200000002",
                membership_status=MembershipStatus.EXPIRED,
                membership_plan="Monthly",
                membership_start=date.today() - timedelta(days=60),
                membership_end=date.today() - timedelta(days=30),
            ),
            Member(
                id=uuid4(),
                gym_id=gym.id,
                name="Active Annual",
                phone="9200000003",
                membership_status=MembershipStatus.ACTIVE,
                membership_plan="Annual",
                membership_start=date.today(),
                membership_end=date.today() + timedelta(days=365),
            ),
        ]
        for m in members:
            db_session.add(m)
        await db_session.flush()

    async def test_status_and_plan_combined(
        self, client: AsyncClient, db_session: AsyncSession,
        sample_gym: Gym, auth_headers: dict,
    ):
        await self._seed_members(db_session, sample_gym)

        resp = await client.get(
            "/api/v1/members?status=active&plan=Monthly", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["members"][0]["name"] == "Active Monthly"

    async def test_status_and_search_combined(
        self, client: AsyncClient, db_session: AsyncSession,
        sample_gym: Gym, auth_headers: dict,
    ):
        await self._seed_members(db_session, sample_gym)

        resp = await client.get(
            "/api/v1/members?status=active&search=Annual", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["members"][0]["name"] == "Active Annual"

    async def test_all_filters_combined(
        self, client: AsyncClient, db_session: AsyncSession,
        sample_gym: Gym, auth_headers: dict,
    ):
        await self._seed_members(db_session, sample_gym)

        resp = await client.get(
            "/api/v1/members?status=expired&plan=Monthly&search=Expired",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["members"][0]["name"] == "Expired Monthly"
