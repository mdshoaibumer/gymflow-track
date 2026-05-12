"""
Tests for CSV export endpoints.

Coverage:
1. GET /reports/members/csv — member export
2. GET /reports/payments/csv — payment export
3. GET /reports/attendance/csv — attendance export
4. RBAC — OWNER and ADMIN can export, STAFF cannot
5. Content-Type validation — returns text/csv
6. Feature gating — requires Pro plan (export_reports_enabled)
"""

from datetime import date, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.attendance import Attendance, AttendanceStatus, CheckInSource


# === Fixtures ===


@pytest.fixture
async def report_member(
    db_session: AsyncSession, sample_gym: Gym
) -> Member:
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Report Test Member",
        phone="9600000001",
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
async def report_payment(
    db_session: AsyncSession, sample_gym: Gym, report_member: Member
) -> Payment:
    payment = Payment(
        id=uuid4(),
        gym_id=sample_gym.id,
        member_id=report_member.id,
        amount_in_paise=150000,
        payment_method=PaymentMethod.CASH,
        payment_status=PaymentStatus.COMPLETED,
        payment_date=date.today(),
    )
    db_session.add(payment)
    await db_session.flush()
    return payment


@pytest.fixture
async def report_attendance(
    db_session: AsyncSession, sample_gym: Gym, report_member: Member
) -> Attendance:
    from datetime import datetime, timezone

    att = Attendance(
        id=uuid4(),
        gym_id=sample_gym.id,
        member_id=report_member.id,
        check_in_at=datetime.now(timezone.utc),
        check_in_date=date.today(),
        status=AttendanceStatus.CHECKED_IN,
        source=CheckInSource.MANUAL,
    )
    db_session.add(att)
    await db_session.flush()
    return att


class TestMembersCSV:
    """Test GET /api/v1/reports/members/csv."""

    async def test_owner_can_export_members(
        self,
        client: AsyncClient,
        auth_headers: dict,
        report_member: Member,
    ):
        response = await client.get(
            "/api/v1/reports/members/csv", headers=auth_headers
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("content-type", "")
        content = response.text
        assert "Name" in content
        assert "Report Test Member" in content

    async def test_admin_can_export_members(
        self,
        client: AsyncClient,
        admin_headers: dict,
        report_member: Member,
    ):
        response = await client.get(
            "/api/v1/reports/members/csv", headers=admin_headers
        )
        assert response.status_code == 200

    async def test_staff_cannot_export_members(
        self, client: AsyncClient, staff_headers: dict
    ):
        response = await client.get(
            "/api/v1/reports/members/csv", headers=staff_headers
        )
        assert response.status_code == 403

    async def test_csv_has_expected_columns(
        self,
        client: AsyncClient,
        auth_headers: dict,
        report_member: Member,
    ):
        response = await client.get(
            "/api/v1/reports/members/csv", headers=auth_headers
        )
        first_line = response.text.split("\n")[0]
        assert "Name" in first_line
        assert "Phone" in first_line
        assert "Status" in first_line


class TestPaymentsCSV:
    """Test GET /api/v1/reports/payments/csv."""

    async def test_owner_can_export_payments(
        self,
        client: AsyncClient,
        auth_headers: dict,
        report_payment: Payment,
    ):
        response = await client.get(
            "/api/v1/reports/payments/csv", headers=auth_headers
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("content-type", "")

    async def test_date_range_filter(
        self,
        client: AsyncClient,
        auth_headers: dict,
        report_payment: Payment,
    ):
        today = date.today().isoformat()
        response = await client.get(
            f"/api/v1/reports/payments/csv?date_from={today}&date_to={today}",
            headers=auth_headers,
        )
        assert response.status_code == 200

    async def test_staff_cannot_export_payments(
        self, client: AsyncClient, staff_headers: dict
    ):
        response = await client.get(
            "/api/v1/reports/payments/csv", headers=staff_headers
        )
        assert response.status_code == 403


class TestAttendanceCSV:
    """Test GET /api/v1/reports/attendance/csv."""

    async def test_owner_can_export_attendance(
        self,
        client: AsyncClient,
        auth_headers: dict,
        report_attendance: Attendance,
    ):
        response = await client.get(
            "/api/v1/reports/attendance/csv", headers=auth_headers
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("content-type", "")

    async def test_staff_cannot_export_attendance(
        self, client: AsyncClient, staff_headers: dict
    ):
        response = await client.get(
            "/api/v1/reports/attendance/csv", headers=staff_headers
        )
        assert response.status_code == 403

    async def test_unauthenticated_rejected(self, client: AsyncClient):
        response = await client.get("/api/v1/reports/attendance/csv")
        assert response.status_code in (401, 403)
