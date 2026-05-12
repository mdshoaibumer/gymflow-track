"""
Tests for Analytics endpoints.

Coverage:
1. GET /analytics/revenue-trend — daily/weekly/monthly granularity
2. GET /analytics/revenue-summary — summary stats
3. GET /analytics/membership-distribution — plan breakdown
4. GET /analytics/dashboard-kpis — KPI cards with trends
5. RBAC — all authenticated roles can view
6. Edge case — empty gym with no data
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
async def analytics_data(
    db_session: AsyncSession, sample_gym: Gym
) -> dict:
    """Create members and payments for analytics queries."""
    today = date.today()

    members = []
    for i in range(5):
        m = Member(
            id=uuid4(),
            gym_id=sample_gym.id,
            name=f"Analytics Member {i}",
            phone=f"970000{i:04d}",
            membership_status=MembershipStatus.ACTIVE,
            membership_start=today - timedelta(days=30),
            membership_end=today + timedelta(days=30),
            membership_plan="Monthly" if i < 3 else "Quarterly",
            amount_paid=150000 if i < 3 else 400000,
        )
        db_session.add(m)
        members.append(m)

    await db_session.flush()

    payments = []
    for m in members:
        p = Payment(
            id=uuid4(),
            gym_id=sample_gym.id,
            member_id=m.id,
            amount_in_paise=m.amount_paid,
            payment_method=PaymentMethod.UPI,
            payment_status=PaymentStatus.COMPLETED,
            payment_date=today - timedelta(days=5),
        )
        db_session.add(p)
        payments.append(p)

    await db_session.flush()
    return {"members": members, "payments": payments}


class TestRevenueTrend:
    """Test GET /api/v1/analytics/revenue-trend."""

    async def test_monthly_trend(
        self, client: AsyncClient, auth_headers: dict, analytics_data: dict
    ):
        response = await client.get(
            "/api/v1/analytics/revenue-trend?granularity=monthly",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "summary" in data
        assert data["granularity"] == "monthly"
        assert isinstance(data["data"], list)

    async def test_daily_trend(
        self, client: AsyncClient, auth_headers: dict, analytics_data: dict
    ):
        response = await client.get(
            "/api/v1/analytics/revenue-trend?granularity=daily",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["granularity"] == "daily"
        assert len(data["data"]) > 0

    async def test_weekly_trend(
        self, client: AsyncClient, auth_headers: dict, analytics_data: dict
    ):
        response = await client.get(
            "/api/v1/analytics/revenue-trend?granularity=weekly",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["granularity"] == "weekly"

    async def test_empty_gym_returns_zeros(
        self, client: AsyncClient, auth_headers: dict
    ):
        """A gym with no payments should still return a valid response."""
        response = await client.get(
            "/api/v1/analytics/revenue-trend?granularity=monthly",
            headers=auth_headers,
        )
        assert response.status_code == 200

    async def test_staff_can_view(
        self, client: AsyncClient, staff_headers: dict
    ):
        response = await client.get(
            "/api/v1/analytics/revenue-trend?granularity=monthly",
            headers=staff_headers,
        )
        assert response.status_code == 200


class TestRevenueSummary:
    """Test GET /api/v1/analytics/revenue-summary."""

    async def test_returns_summary(
        self, client: AsyncClient, auth_headers: dict, analytics_data: dict
    ):
        response = await client.get(
            "/api/v1/analytics/revenue-summary", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_revenue_paise" in data


class TestMembershipDistribution:
    """Test GET /api/v1/analytics/membership-distribution."""

    async def test_returns_distribution(
        self, client: AsyncClient, auth_headers: dict, analytics_data: dict
    ):
        response = await client.get(
            "/api/v1/analytics/membership-distribution", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "distributions" in data
        assert isinstance(data["distributions"], list)

    async def test_empty_gym(self, client: AsyncClient, auth_headers: dict):
        response = await client.get(
            "/api/v1/analytics/membership-distribution", headers=auth_headers
        )
        assert response.status_code == 200


class TestDashboardKPIs:
    """Test GET /api/v1/analytics/dashboard-kpis."""

    async def test_returns_kpis(
        self, client: AsyncClient, auth_headers: dict, analytics_data: dict
    ):
        response = await client.get(
            "/api/v1/analytics/dashboard-kpis?period_days=30",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "kpis" in data

    async def test_custom_period(
        self, client: AsyncClient, auth_headers: dict
    ):
        response = await client.get(
            "/api/v1/analytics/dashboard-kpis?period_days=7",
            headers=auth_headers,
        )
        assert response.status_code == 200

    async def test_unauthenticated_rejected(self, client: AsyncClient):
        response = await client.get("/api/v1/analytics/dashboard-kpis")
        assert response.status_code in (401, 403)
