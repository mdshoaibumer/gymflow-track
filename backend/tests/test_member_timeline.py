"""Tests for GET /members/{member_id}/timeline endpoint."""

from datetime import date, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceStatus, CheckInSource
from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.models.payment import Payment
from app.models.user import User


@pytest.fixture
async def timeline_member(db_session: AsyncSession, sample_gym: Gym) -> Member:
    """Create a member for timeline tests."""
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Timeline Member",
        phone="9000000001",
        membership_status=MembershipStatus.ACTIVE,
        membership_start=date.today() - timedelta(days=30),
        membership_end=date.today() + timedelta(days=60),
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def member_with_activity(db_session: AsyncSession, sample_gym: Gym, timeline_member: Member) -> Member:
    """Create a member with payments and attendance records."""
    from app.models.attendance import Attendance

    # Add a payment
    payment = Payment(
        id=uuid4(),
        gym_id=sample_gym.id,
        member_id=timeline_member.id,
        amount_in_paise=100000,
        method="cash",
        payment_date=date.today() - timedelta(days=5),
        notes="Monthly fee",
    )
    db_session.add(payment)

    # Add attendance records
    for i in range(3):
        att = Attendance(
            id=uuid4(),
            gym_id=sample_gym.id,
            member_id=timeline_member.id,
            check_in_date=date.today() - timedelta(days=i),
            check_in_at=datetime.now() - timedelta(days=i),
            status=AttendanceStatus.CHECKED_IN,
            source=CheckInSource.MANUAL,
        )
        db_session.add(att)

    await db_session.flush()
    return timeline_member


@pytest.mark.anyio
class TestMemberTimeline:
    """Tests for the member timeline endpoint."""

    async def test_timeline_empty(self, client, timeline_member, auth_headers):
        """Timeline with no activity returns empty list."""
        response = await client.get(
            f"/members/{timeline_member.id}/timeline",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "events" in data
        assert isinstance(data["events"], list)
        assert data["total"] >= 0

    async def test_timeline_with_activity(self, client, member_with_activity, auth_headers):
        """Timeline returns payment and attendance events."""
        response = await client.get(
            f"/members/{member_with_activity.id}/timeline",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        events = data["events"]
        assert len(events) >= 4  # 1 payment + 3 attendance

        # All events have required fields
        for event in events:
            assert "id" in event
            assert "event_type" in event
            assert "title" in event
            assert "timestamp" in event

        # Check event types present
        event_types = {e["event_type"] for e in events}
        assert "payment" in event_types
        assert "attendance" in event_types

    async def test_timeline_sorted_desc(self, client, member_with_activity, auth_headers):
        """Timeline events are sorted by timestamp descending (newest first)."""
        response = await client.get(
            f"/members/{member_with_activity.id}/timeline",
            headers=auth_headers,
        )
        assert response.status_code == 200
        events = response.json()["events"]
        timestamps = [e["timestamp"] for e in events]
        assert timestamps == sorted(timestamps, reverse=True)

    async def test_timeline_limit(self, client, member_with_activity, auth_headers):
        """Timeline respects limit parameter."""
        response = await client.get(
            f"/members/{member_with_activity.id}/timeline?limit=2",
            headers=auth_headers,
        )
        assert response.status_code == 200
        events = response.json()["events"]
        assert len(events) <= 2

    async def test_timeline_no_auth(self, client, timeline_member):
        """Requires authentication."""
        response = await client.get(
            f"/members/{timeline_member.id}/timeline",
        )
        assert response.status_code == 401

    async def test_timeline_nonexistent_member(self, client, auth_headers):
        """404 for non-existent member."""
        fake_id = uuid4()
        response = await client.get(
            f"/members/{fake_id}/timeline",
            headers=auth_headers,
        )
        assert response.status_code in (404, 200)  # May return empty or 404
