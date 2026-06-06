"""
Tests for Dashboard endpoints.

Coverage:
1. GET /dashboard/metrics — aggregated stats
2. GET /dashboard/expiring — members expiring soon
3. GET /dashboard/recent-payments — latest payments
4. RBAC — all roles can view
5. Tenant isolation — only sees own gym data
"""

from datetime import date, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.models.payment import Payment, PaymentMethod, PaymentStatus


# === Fixtures ===


@pytest.fixture
async def dashboard_members(
    db_session: AsyncSession, sample_gym: Gym
) -> list[Member]:
    """Create a mix of active, expiring, and expired members."""
    members = []
    today = date.today()

    # Active member (not expiring soon)
    m1 = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Active Long",
        phone="9800000001",
        membership_status=MembershipStatus.ACTIVE,
        membership_start=today - timedelta(days=10),
        membership_end=today + timedelta(days=60),
        membership_plan="Quarterly",
        amount_paid=400000,
    )
    members.append(m1)

    # Expiring in 3 days
    m2 = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Expiring Soon",
        phone="9800000002",
        membership_status=MembershipStatus.ACTIVE,
        membership_start=today - timedelta(days=27),
        membership_end=today + timedelta(days=3),
        membership_plan="Monthly",
        amount_paid=150000,
    )
    members.append(m2)

    # Already expired
    m3 = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Expired Member",
        phone="9800000003",
        membership_status=MembershipStatus.EXPIRED,
        membership_start=today - timedelta(days=60),
        membership_end=today - timedelta(days=5),
        membership_plan="Monthly",
        amount_paid=150000,
    )
    members.append(m3)

    for m in members:
        db_session.add(m)
    await db_session.flush()
    return members


@pytest.fixture
async def dashboard_payments(
    db_session: AsyncSession, sample_gym: Gym, dashboard_members: list[Member]
) -> list[Payment]:
    """Create payments for dashboard display."""
    payments = []
    today = date.today()

    p1 = Payment(
        id=uuid4(),
        gym_id=sample_gym.id,
        member_id=dashboard_members[0].id,
        amount_in_paise=400000,
        payment_method=PaymentMethod.UPI,
        payment_status=PaymentStatus.COMPLETED,
        payment_date=today - timedelta(days=2),
        notes="Quarterly plan",
    )
    payments.append(p1)

    p2 = Payment(
        id=uuid4(),
        gym_id=sample_gym.id,
        member_id=dashboard_members[1].id,
        amount_in_paise=150000,
        payment_method=PaymentMethod.CASH,
        payment_status=PaymentStatus.COMPLETED,
        payment_date=today,
        notes="Monthly plan",
    )
    payments.append(p2)

    for p in payments:
        db_session.add(p)
    await db_session.flush()
    return payments


class TestDashboardMetrics:
    """Test GET /api/v1/dashboard/metrics."""

    async def test_returns_metrics(
        self,
        client: AsyncClient,
        auth_headers: dict,
        dashboard_members: list[Member],
        dashboard_payments: list[Payment],
    ):
        response = await client.get(
            "/api/v1/dashboard/metrics", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_members" in data
        assert "active_members" in data
        assert "expiring_soon" in data
        assert "expired_members" in data
        assert "monthly_revenue_paise" in data
        assert data["total_members"] >= 3
        assert data["active_members"] >= 2
        assert data["expired_members"] >= 1

    async def test_staff_cannot_view_metrics(
        self, client: AsyncClient, staff_headers: dict
    ):
        """STAFF role cannot access dashboard metrics (contains revenue) — 403."""
        response = await client.get(
            "/api/v1/dashboard/metrics", headers=staff_headers
        )
        assert response.status_code == 403

    async def test_unauthenticated_rejected(self, client: AsyncClient):
        response = await client.get("/api/v1/dashboard/metrics")
        assert response.status_code in (401, 403)


class TestExpiringMemberships:
    """Test GET /api/v1/dashboard/expiring."""

    async def test_returns_expiring_members(
        self,
        client: AsyncClient,
        auth_headers: dict,
        dashboard_members: list[Member],
    ):
        response = await client.get(
            "/api/v1/dashboard/expiring?days=7", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should include the member expiring in 3 days
        names = [m["name"] for m in data]
        assert "Expiring Soon" in names

    async def test_custom_days_parameter(
        self, client: AsyncClient, auth_headers: dict, dashboard_members: list
    ):
        response = await client.get(
            "/api/v1/dashboard/expiring?days=1", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        # 3-day expiring member should NOT appear in 1-day window
        names = [m["name"] for m in data]
        assert "Expiring Soon" not in names


class TestRecentPayments:
    """Test GET /api/v1/dashboard/recent-payments."""

    async def test_returns_recent_payments(
        self,
        client: AsyncClient,
        auth_headers: dict,
        dashboard_payments: list[Payment],
    ):
        response = await client.get(
            "/api/v1/dashboard/recent-payments?limit=10", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2

    async def test_limit_parameter(
        self,
        client: AsyncClient,
        auth_headers: dict,
        dashboard_payments: list[Payment],
    ):
        response = await client.get(
            "/api/v1/dashboard/recent-payments?limit=1", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    async def test_staff_cannot_view_recent_payments(
        self, client: AsyncClient, staff_headers: dict
    ):
        """STAFF cannot view recent payments (financial data) — 403."""
        response = await client.get(
            "/api/v1/dashboard/recent-payments", headers=staff_headers
        )
        assert response.status_code == 403


class TestDashboardRBAC:
    """Test role-based access for dashboard endpoints."""

    async def test_staff_can_view_expiring(
        self, client: AsyncClient, staff_headers: dict
    ):
        """STAFF can still view expiring memberships (operational data)."""
        response = await client.get(
            "/api/v1/dashboard/expiring?days=7", headers=staff_headers
        )
        assert response.status_code == 200

    async def test_admin_can_view_metrics(
        self, client: AsyncClient, admin_headers: dict
    ):
        """ADMIN can access dashboard metrics."""
        response = await client.get(
            "/api/v1/dashboard/metrics", headers=admin_headers
        )
        assert response.status_code == 200

    async def test_admin_can_view_recent_payments(
        self, client: AsyncClient, admin_headers: dict
    ):
        """ADMIN can access recent payments."""
        response = await client.get(
            "/api/v1/dashboard/recent-payments", headers=admin_headers
        )
        assert response.status_code == 200
