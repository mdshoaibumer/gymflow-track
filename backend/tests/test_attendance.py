"""
Tests for Attendance + QR Check-In System.

Coverage:
1. QR check-in — valid token results in attendance record
2. Duplicate prevention — same day = idempotent return
3. Expired membership rejection — non-active members denied
4. Tenant isolation — Gym A QR cannot check into Gym B
5. Manual override — staff can check in without QR
6. Check-out flow — transition from checked_in to checked_out
7. Cross-gym QR rejection — HMAC includes gym_id
8. QR token tamper detection — modified tokens rejected
"""

from datetime import date, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import today_ist
from app.models.attendance import AttendanceStatus, CheckInSource
from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.models.user import User
from app.services.attendance_service import AttendanceService
from app.services.qr_service import generate_qr_token, validate_qr_token


# === Fixtures ===


@pytest.fixture
async def active_member(db_session: AsyncSession, sample_gym: Gym) -> Member:
    """Member with active membership."""
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Active Member",
        phone="9100000001",
        membership_status=MembershipStatus.ACTIVE,
        membership_start=date.today() - timedelta(days=15),
        membership_end=date.today() + timedelta(days=15),
        membership_plan="Monthly",
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def expired_member(db_session: AsyncSession, sample_gym: Gym) -> Member:
    """Member with expired membership."""
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Expired Member",
        phone="9100000002",
        membership_status=MembershipStatus.EXPIRED,
        membership_start=date.today() - timedelta(days=60),
        membership_end=date.today() - timedelta(days=1),
        membership_plan="Monthly",
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def other_gym_member(db_session: AsyncSession, other_gym: Gym) -> Member:
    """Member belonging to a DIFFERENT gym."""
    member = Member(
        id=uuid4(),
        gym_id=other_gym.id,
        name="Other Gym Member",
        phone="9200000001",
        membership_status=MembershipStatus.ACTIVE,
        membership_start=date.today() - timedelta(days=10),
        membership_end=date.today() + timedelta(days=20),
        membership_plan="Monthly",
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return member


# === QR Token Tests (Unit) ===


class TestQRTokens:
    def test_generate_and_validate(self, sample_gym: Gym, active_member: Member):
        """Generated QR token should validate successfully."""
        token = generate_qr_token(sample_gym.id, active_member.id)
        result = validate_qr_token(token)
        assert result is not None
        gym_id, member_id = result
        assert gym_id == sample_gym.id
        assert member_id == active_member.id

    def test_deterministic_generation(self, sample_gym: Gym, active_member: Member):
        """Same member always gets the same QR token."""
        token1 = generate_qr_token(sample_gym.id, active_member.id)
        token2 = generate_qr_token(sample_gym.id, active_member.id)
        assert token1 == token2

    def test_tampered_token_rejected(self, sample_gym: Gym, active_member: Member):
        """Modifying any part of the token invalidates it."""
        token = generate_qr_token(sample_gym.id, active_member.id)
        # Flip a character in the signature
        tampered = token[:-1] + ("X" if token[-1] != "X" else "Y")
        assert validate_qr_token(tampered) is None

    def test_invalid_format_rejected(self):
        """Garbage input returns None."""
        assert validate_qr_token("") is None
        assert validate_qr_token("not-a-token") is None
        assert validate_qr_token("a:b") is None
        assert validate_qr_token("a:b:c:d") is None


# === Attendance Service Tests ===


@pytest.mark.asyncio
async def test_qr_check_in_success(
    db_session: AsyncSession, sample_gym: Gym, active_member: Member, sample_user: User
):
    """Valid QR token + active membership = successful check-in."""
    qr_token = generate_qr_token(sample_gym.id, active_member.id)
    service = AttendanceService(db_session)
    attendance = await service.check_in_by_qr(
        gym_id=sample_gym.id,
        qr_token=qr_token,
        recorded_by=sample_user.id,
    )
    assert attendance.member_id == active_member.id
    assert attendance.gym_id == sample_gym.id
    assert attendance.status == AttendanceStatus.CHECKED_IN
    assert attendance.source == CheckInSource.QR
    assert attendance.check_in_date == today_ist()


@pytest.mark.asyncio
async def test_duplicate_check_in_returns_existing(
    db_session: AsyncSession, sample_gym: Gym, active_member: Member, sample_user: User
):
    """Scanning QR twice in one day returns existing record, no error."""
    qr_token = generate_qr_token(sample_gym.id, active_member.id)
    service = AttendanceService(db_session)

    first = await service.check_in_by_qr(sample_gym.id, qr_token, sample_user.id)
    second = await service.check_in_by_qr(sample_gym.id, qr_token, sample_user.id)

    assert first.id == second.id  # Same record returned


@pytest.mark.asyncio
async def test_expired_membership_rejected(
    db_session: AsyncSession, sample_gym: Gym, expired_member: Member, sample_user: User
):
    """Members with expired membership cannot check in."""
    from app.core.exceptions import ValidationError

    qr_token = generate_qr_token(sample_gym.id, expired_member.id)
    service = AttendanceService(db_session)

    with pytest.raises(ValidationError, match="expired"):
        await service.check_in_by_qr(sample_gym.id, qr_token, sample_user.id)


@pytest.mark.asyncio
async def test_cross_gym_qr_rejected(
    db_session: AsyncSession,
    sample_gym: Gym,
    other_gym: Gym,
    other_gym_member: Member,
    sample_user: User,
):
    """QR from Gym B cannot be used to check into Gym A."""
    from app.core.exceptions import ValidationError

    # Generate QR for other gym's member
    qr_token = generate_qr_token(other_gym.id, other_gym_member.id)
    service = AttendanceService(db_session)

    # Try to use it in sample_gym → should fail
    with pytest.raises(ValidationError, match="different gym"):
        await service.check_in_by_qr(sample_gym.id, qr_token, sample_user.id)


@pytest.mark.asyncio
async def test_manual_check_in_success(
    db_session: AsyncSession, sample_gym: Gym, active_member: Member, sample_user: User
):
    """Staff can manually check in a member without QR."""
    service = AttendanceService(db_session)
    attendance = await service.check_in_manual(
        gym_id=sample_gym.id,
        member_id=active_member.id,
        recorded_by=sample_user.id,
    )
    assert attendance.member_id == active_member.id
    assert attendance.source == CheckInSource.MANUAL
    assert attendance.status == AttendanceStatus.CHECKED_IN


@pytest.mark.asyncio
async def test_check_out_flow(
    db_session: AsyncSession, sample_gym: Gym, active_member: Member, sample_user: User
):
    """Check-out transitions status from checked_in to checked_out."""
    service = AttendanceService(db_session)
    attendance = await service.check_in_manual(
        sample_gym.id, active_member.id, sample_user.id
    )
    assert attendance.status == AttendanceStatus.CHECKED_IN

    checked_out = await service.check_out(sample_gym.id, attendance.id)
    assert checked_out.status == AttendanceStatus.CHECKED_OUT
    assert checked_out.check_out_at is not None


@pytest.mark.asyncio
async def test_double_check_out_rejected(
    db_session: AsyncSession, sample_gym: Gym, active_member: Member, sample_user: User
):
    """Cannot check out twice."""
    from app.core.exceptions import ValidationError

    service = AttendanceService(db_session)
    attendance = await service.check_in_manual(
        sample_gym.id, active_member.id, sample_user.id
    )
    await service.check_out(sample_gym.id, attendance.id)

    with pytest.raises(ValidationError, match="not checked in"):
        await service.check_out(sample_gym.id, attendance.id)


# === API Integration Tests ===


@pytest.mark.asyncio
async def test_api_qr_check_in(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_gym: Gym,
    active_member: Member,
):
    """POST /attendance/check-in with valid QR returns 200."""
    qr_token = generate_qr_token(sample_gym.id, active_member.id)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/attendance/check-in",
        json={"qr_token": qr_token},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["member_id"] == str(active_member.id)
    assert data["status"] == "checked_in"
    assert data["source"] == "qr"
    assert data["member_name"] == "Active Member"


@pytest.mark.asyncio
async def test_api_expired_membership_returns_422(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_gym: Gym,
    expired_member: Member,
):
    """POST /attendance/check-in with expired membership returns 422."""
    qr_token = generate_qr_token(sample_gym.id, expired_member.id)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/attendance/check-in",
        json={"qr_token": qr_token},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "expired" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_api_invalid_qr_returns_422(
    client: AsyncClient, auth_headers: dict
):
    """POST /attendance/check-in with garbage QR returns 422."""
    resp = await client.post(
        "/api/v1/attendance/check-in",
        json={"qr_token": "totally-invalid-token"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "invalid" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_api_today_list(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_gym: Gym,
    active_member: Member,
):
    """GET /attendance/today returns today's check-ins."""
    qr_token = generate_qr_token(sample_gym.id, active_member.id)
    await db_session.commit()

    # Check in first
    await client.post(
        "/api/v1/attendance/check-in",
        json={"qr_token": qr_token},
        headers=auth_headers,
    )

    resp = await client.get("/api/v1/attendance/today", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert len(data["attendance"]) >= 1


@pytest.mark.asyncio
async def test_api_stats(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_gym: Gym,
    active_member: Member,
):
    """GET /attendance/stats returns correct metrics."""
    qr_token = generate_qr_token(sample_gym.id, active_member.id)
    await db_session.commit()

    await client.post(
        "/api/v1/attendance/check-in",
        json={"qr_token": qr_token},
        headers=auth_headers,
    )

    resp = await client.get("/api/v1/attendance/stats", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["checked_in_today"] >= 1
    assert data["currently_in_gym"] >= 1


@pytest.mark.asyncio
async def test_api_tenant_isolation(
    client: AsyncClient,
    auth_headers: dict,
    other_auth_headers: dict,
    db_session: AsyncSession,
    sample_gym: Gym,
    active_member: Member,
    other_gym,
    other_user,
):
    """Gym A's attendance should not appear in Gym B's today list."""
    qr_token = generate_qr_token(sample_gym.id, active_member.id)
    await db_session.commit()

    # Check in at sample_gym
    await client.post(
        "/api/v1/attendance/check-in",
        json={"qr_token": qr_token},
        headers=auth_headers,
    )

    # Other gym sees nothing
    resp = await client.get("/api/v1/attendance/today", headers=other_auth_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_api_manual_check_in(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    active_member: Member,
):
    """POST /attendance/check-in/manual works for staff."""
    await db_session.commit()

    resp = await client.post(
        "/api/v1/attendance/check-in/manual",
        json={"member_id": str(active_member.id)},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["source"] == "manual"


@pytest.mark.asyncio
async def test_api_check_out(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_gym: Gym,
    active_member: Member,
):
    """POST /attendance/{id}/check-out transitions to checked_out."""
    qr_token = generate_qr_token(sample_gym.id, active_member.id)
    await db_session.commit()

    # Check in
    resp = await client.post(
        "/api/v1/attendance/check-in",
        json={"qr_token": qr_token},
        headers=auth_headers,
    )
    attendance_id = resp.json()["id"]

    # Check out
    resp2 = await client.post(
        f"/api/v1/attendance/{attendance_id}/check-out",
        headers=auth_headers,
    )
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "checked_out"
    assert resp2.json()["check_out_at"] is not None


@pytest.mark.asyncio
async def test_api_qr_generation_requires_admin(
    client: AsyncClient,
    staff_headers: dict,
    db_session: AsyncSession,
    active_member: Member,
    staff_user,
):
    """GET /attendance/member/{id}/qr requires ADMIN role."""
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/attendance/member/{active_member.id}/qr",
        headers=staff_headers,
    )
    assert resp.status_code == 403


# === Self-Service Check-In Tests ===


@pytest.mark.asyncio
async def test_self_service_check_in_by_phone(
    db_session: AsyncSession, sample_gym: Gym, active_member: Member
):
    """Self-service check-in by phone number creates attendance with correct source."""
    service = AttendanceService(db_session)
    attendance = await service.check_in_self_service(
        gym_id=sample_gym.id,
        identifier=active_member.phone,
    )
    assert attendance.member_id == active_member.id
    assert attendance.gym_id == sample_gym.id
    assert attendance.source == CheckInSource.SELF_SERVICE
    assert attendance.status == AttendanceStatus.CHECKED_IN


@pytest.mark.asyncio
async def test_self_service_check_in_by_name(
    db_session: AsyncSession, sample_gym: Gym, active_member: Member
):
    """Self-service check-in by name finds the member."""
    service = AttendanceService(db_session)
    attendance = await service.check_in_self_service(
        gym_id=sample_gym.id,
        identifier=active_member.name,
    )
    assert attendance.member_id == active_member.id
    assert attendance.source == CheckInSource.SELF_SERVICE


@pytest.mark.asyncio
async def test_self_service_check_in_not_found(
    db_session: AsyncSession, sample_gym: Gym
):
    """Self-service check-in with unknown identifier raises NotFoundError."""
    from app.core.exceptions import NotFoundError

    service = AttendanceService(db_session)
    with pytest.raises(NotFoundError, match="No member found"):
        await service.check_in_self_service(
            gym_id=sample_gym.id,
            identifier="nonexistent_person_12345",
        )


@pytest.mark.asyncio
async def test_self_service_check_in_expired_membership(
    db_session: AsyncSession, sample_gym: Gym, expired_member: Member
):
    """Self-service check-in with expired membership is rejected."""
    from app.core.exceptions import ValidationError

    service = AttendanceService(db_session)
    with pytest.raises(ValidationError, match="expired"):
        await service.check_in_self_service(
            gym_id=sample_gym.id,
            identifier=expired_member.phone,
        )


@pytest.mark.asyncio
async def test_self_service_duplicate_same_day(
    db_session: AsyncSession, sample_gym: Gym, active_member: Member
):
    """Self-service check-in twice same day returns existing record (idempotent)."""
    service = AttendanceService(db_session)
    first = await service.check_in_self_service(sample_gym.id, active_member.phone)
    second = await service.check_in_self_service(sample_gym.id, active_member.phone)
    assert first.id == second.id


@pytest.mark.asyncio
async def test_all_checkin_sources_are_valid_enum_values():
    """All CheckInSource values are valid — ensures enum sync between Python and DB."""
    expected = {"qr", "manual", "whatsapp_qr", "self_service", "biometric"}
    actual = {s.value for s in CheckInSource}
    assert expected == actual
