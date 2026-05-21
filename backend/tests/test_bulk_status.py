"""Tests for bulk member status change endpoint."""

from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gym import Gym
from app.models.member import Member, MembershipStatus


@pytest.fixture
async def sample_members(db_session: AsyncSession, sample_gym: Gym):
    """Create 5 test members for bulk operations."""
    members = []
    for i in range(5):
        m = Member(
            id=uuid4(),
            gym_id=sample_gym.id,
            name=f"Bulk Member {i}",
            phone=f"900000000{i}",
            membership_status=MembershipStatus.ACTIVE,
        )
        db_session.add(m)
        members.append(m)
    await db_session.flush()
    return members


@pytest.mark.asyncio
async def test_bulk_status_change_success(
    client, auth_headers, sample_members
):
    """PATCH /api/v1/members/bulk/status should update multiple members."""
    ids = [str(m.id) for m in sample_members[:3]]
    resp = await client.patch(
        "/api/v1/members/bulk/status",
        json={"member_ids": ids, "status": "frozen"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["updated_count"] == 3


@pytest.mark.asyncio
async def test_bulk_status_change_empty_list(client, auth_headers):
    """Should reject empty member_ids list."""
    resp = await client.patch(
        "/api/v1/members/bulk/status",
        json={"member_ids": [], "status": "active"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_bulk_status_change_invalid_status(
    client, auth_headers, sample_members
):
    """Should reject invalid status value."""
    ids = [str(m.id) for m in sample_members[:2]]
    resp = await client.patch(
        "/api/v1/members/bulk/status",
        json={"member_ids": ids, "status": "invalid_status"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_bulk_status_change_cross_tenant_isolation(
    client, other_auth_headers, sample_members
):
    """Members from another gym should not be updated."""
    ids = [str(m.id) for m in sample_members[:2]]
    resp = await client.patch(
        "/api/v1/members/bulk/status",
        json={"member_ids": ids, "status": "expired"},
        headers=other_auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    # Should update 0 because these members belong to a different gym
    assert data["updated_count"] == 0


@pytest.mark.asyncio
async def test_bulk_status_change_requires_auth(client, sample_members):
    """Should require authentication."""
    ids = [str(m.id) for m in sample_members[:2]]
    resp = await client.patch(
        "/api/v1/members/bulk/status",
        json={"member_ids": ids, "status": "active"},
    )
    assert resp.status_code == 401
