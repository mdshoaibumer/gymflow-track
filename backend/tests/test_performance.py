"""
Performance regression tests — catch endpoint latency regressions in CI.

These tests measure response time of critical API paths and fail if any
endpoint exceeds its SLA threshold. Not a substitute for load testing,
but catches obvious regressions (e.g., missing index, N+1 query).

Thresholds are generous (single-request, no concurrency) to avoid
flaky failures in CI. Real load testing should be done separately.

Run with: pytest tests/test_performance.py -v
"""

import time
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.models.payment import Payment, PaymentMethod, PaymentStatus

# SLA thresholds in seconds (generous for CI cold-start)
_AUTH_SLA = 2.0       # auth endpoints
_LIST_SLA = 2.0       # list endpoints (paginated)
_DASHBOARD_SLA = 3.0  # dashboard (multiple queries)
_WRITE_SLA = 2.0      # create/update endpoints


def _timed_request(start: float) -> float:
    """Return elapsed time in seconds."""
    return time.perf_counter() - start


@pytest.mark.slow
class TestAuthPerformance:
    """Auth endpoints must respond within SLA."""

    async def test_register_latency(self, client: AsyncClient):
        start = time.perf_counter()
        resp = await client.post("/api/v1/auth/register", json={
            "gym_name": f"Perf Gym {uuid4().hex[:6]}",
            "owner_name": "Perf User",
            "phone": "9876500301",
            "email": f"perf-{uuid4().hex[:6]}@test.com",
            "password": "SecurePass123",
        })
        elapsed = _timed_request(start)
        assert resp.status_code == 201
        assert elapsed < _AUTH_SLA, f"Register took {elapsed:.2f}s (SLA: {_AUTH_SLA}s)"

    async def test_login_latency(self, client: AsyncClient):
        email = f"perf-login-{uuid4().hex[:6]}@test.com"
        await client.post("/api/v1/auth/register", json={
            "gym_name": f"Perf Login Gym {uuid4().hex[:6]}",
            "owner_name": "Login Perf",
            "phone": "9876500302",
            "email": email,
            "password": "SecurePass123",
        })

        start = time.perf_counter()
        resp = await client.post("/api/v1/auth/login", json={
            "email": email, "password": "SecurePass123",
        })
        elapsed = _timed_request(start)
        assert resp.status_code == 200
        assert elapsed < _AUTH_SLA, f"Login took {elapsed:.2f}s (SLA: {_AUTH_SLA}s)"

    async def test_me_latency(self, client: AsyncClient, auth_headers: dict):
        start = time.perf_counter()
        resp = await client.get("/api/v1/auth/me", headers=auth_headers)
        elapsed = _timed_request(start)
        assert resp.status_code == 200
        assert elapsed < _AUTH_SLA, f"/auth/me took {elapsed:.2f}s (SLA: {_AUTH_SLA}s)"


@pytest.mark.slow
class TestMemberPerformance:
    """Member CRUD must respond within SLA."""

    async def test_create_member_latency(
        self, client: AsyncClient, auth_headers: dict
    ):
        start = time.perf_counter()
        resp = await client.post("/api/v1/members", json={
            "name": "Perf Member",
            "phone": f"98765{uuid4().hex[:5][:5]}",
        }, headers=auth_headers)
        elapsed = _timed_request(start)
        assert resp.status_code == 201
        assert elapsed < _WRITE_SLA, f"Create member took {elapsed:.2f}s (SLA: {_WRITE_SLA}s)"

    async def test_list_members_latency(
        self, client: AsyncClient, auth_headers: dict
    ):
        start = time.perf_counter()
        resp = await client.get("/api/v1/members?limit=20", headers=auth_headers)
        elapsed = _timed_request(start)
        assert resp.status_code == 200
        assert elapsed < _LIST_SLA, f"List members took {elapsed:.2f}s (SLA: {_LIST_SLA}s)"


@pytest.mark.slow
class TestPaymentPerformance:
    """Payment recording must respond within SLA."""

    async def test_create_payment_latency(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, sample_gym: Gym,
    ):
        member = Member(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Perf Payment Member",
            phone=f"98765{uuid4().hex[:5][:5]}",
            membership_status=MembershipStatus.ACTIVE,
        )
        db_session.add(member)
        await db_session.flush()

        start = time.perf_counter()
        resp = await client.post("/api/v1/payments", json={
            "member_id": str(member.id),
            "amount_in_paise": 50000,
            "payment_method": "cash",
            "payment_date": "2026-05-13",
        }, headers=auth_headers)
        elapsed = _timed_request(start)
        assert resp.status_code in (200, 201)
        assert elapsed < _WRITE_SLA, f"Create payment took {elapsed:.2f}s (SLA: {_WRITE_SLA}s)"

    async def test_list_payments_latency(
        self, client: AsyncClient, auth_headers: dict
    ):
        start = time.perf_counter()
        resp = await client.get("/api/v1/payments?limit=20", headers=auth_headers)
        elapsed = _timed_request(start)
        assert resp.status_code == 200
        assert elapsed < _LIST_SLA, f"List payments took {elapsed:.2f}s (SLA: {_LIST_SLA}s)"


@pytest.mark.slow
class TestDashboardPerformance:
    """Dashboard aggregate queries must respond within SLA."""

    async def test_dashboard_metrics_latency(
        self, client: AsyncClient, auth_headers: dict
    ):
        start = time.perf_counter()
        resp = await client.get("/api/v1/dashboard/metrics", headers=auth_headers)
        elapsed = _timed_request(start)
        if resp.status_code == 200:
            assert elapsed < _DASHBOARD_SLA, (
                f"Dashboard metrics took {elapsed:.2f}s (SLA: {_DASHBOARD_SLA}s)"
            )


@pytest.mark.slow
class TestHealthPerformance:
    """Health endpoints must be fast (no auth overhead)."""

    async def test_health_live_latency(self, client: AsyncClient):
        start = time.perf_counter()
        resp = await client.get("/health/live")
        elapsed = _timed_request(start)
        assert resp.status_code == 200
        assert elapsed < 0.5, f"/health/live took {elapsed:.2f}s (SLA: 0.5s)"

    async def test_health_ready_latency(self, client: AsyncClient):
        start = time.perf_counter()
        resp = await client.get("/health/ready")
        elapsed = _timed_request(start)
        # ready can fail if scheduler isn't running — accept 200 or 503
        assert resp.status_code in (200, 503)
        assert elapsed < 1.0, f"/health/ready took {elapsed:.2f}s (SLA: 1.0s)"
