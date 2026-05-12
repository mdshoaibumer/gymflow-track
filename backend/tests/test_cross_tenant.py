"""
Cross-tenant isolation tests — verify that Gym A can never access Gym B's data.

These tests are CRITICAL for a multi-tenant SaaS. A single tenant isolation
failure would be a P0 security incident that could expose customer data
across gyms. Every resource endpoint must enforce gym_id scoping.

Test strategy:
1. Create two gyms (A and B) with their own owners and data
2. Attempt to access Gym B's resources using Gym A's auth token
3. Verify every attempt returns 404 (not 403 — don't reveal existence)
"""
import pytest
from uuid import uuid4
from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_backend
from app.core.security import create_access_token, hash_password
from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.attendance import Attendance, AttendanceStatus, CheckInSource
from app.models.asset import Asset, AssetStatus, AssetCategory
from app.models.user import User, UserRole


# ── Fixtures ─────────────────────────────────────────────────

@pytest.fixture
async def gym_a(db_session: AsyncSession) -> Gym:
    gym = Gym(id=uuid4(), name="Gym Alpha", slug=f"gym-alpha-{uuid4().hex[:6]}", phone="9111111111")
    db_session.add(gym)
    await db_session.flush()
    get_cache_backend().set(f"sub:{gym.id}", "full", 99999)
    return gym


@pytest.fixture
async def gym_b(db_session: AsyncSession) -> Gym:
    gym = Gym(id=uuid4(), name="Gym Beta", slug=f"gym-beta-{uuid4().hex[:6]}", phone="9222222222")
    db_session.add(gym)
    await db_session.flush()
    get_cache_backend().set(f"sub:{gym.id}", "full", 99999)
    return gym


@pytest.fixture
async def owner_a(db_session: AsyncSession, gym_a: Gym) -> User:
    user = User(
        id=uuid4(), gym_id=gym_a.id, name="Owner A", email=f"owner-a-{uuid4().hex[:6]}@test.com",
        phone="9111111111", password_hash=hash_password("TestPass123"), role=UserRole.OWNER,
    )
    db_session.add(user)
    await db_session.flush()
    cache = get_cache_backend()
    cache.set(f"user_active:{user.id}", "1", 99999)
    cache.set(f"user_revoked_at:{user.id}", "", 99999)
    return user


@pytest.fixture
async def owner_b(db_session: AsyncSession, gym_b: Gym) -> User:
    user = User(
        id=uuid4(), gym_id=gym_b.id, name="Owner B", email=f"owner-b-{uuid4().hex[:6]}@test.com",
        phone="9222222222", password_hash=hash_password("TestPass123"), role=UserRole.OWNER,
    )
    db_session.add(user)
    await db_session.flush()
    cache = get_cache_backend()
    cache.set(f"user_active:{user.id}", "1", 99999)
    cache.set(f"user_revoked_at:{user.id}", "", 99999)
    return user


@pytest.fixture
def headers_a(owner_a: User, gym_a: Gym) -> dict:
    token = create_access_token(owner_a.id, gym_a.id, owner_a.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def headers_b(owner_b: User, gym_b: Gym) -> dict:
    token = create_access_token(owner_b.id, gym_b.id, owner_b.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def member_b(db_session: AsyncSession, gym_b: Gym) -> Member:
    """A member belonging to Gym B — Gym A should never see this."""
    member = Member(
        id=uuid4(), gym_id=gym_b.id, name="Secret Member",
        phone="9333333333", membership_status=MembershipStatus.ACTIVE,
        membership_start=date.today(), membership_end=date.today() + timedelta(days=30),
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def payment_b(db_session: AsyncSession, gym_b: Gym, member_b: Member, owner_b: User) -> Payment:
    """A payment belonging to Gym B."""
    payment = Payment(
        id=uuid4(), gym_id=gym_b.id, member_id=member_b.id,
        amount_in_paise=100000, payment_method=PaymentMethod.CASH,
        payment_status=PaymentStatus.COMPLETED, payment_date=date.today(),
        created_by=owner_b.id,
    )
    db_session.add(payment)
    await db_session.flush()
    return payment


@pytest.fixture
async def attendance_b(db_session: AsyncSession, gym_b: Gym, member_b: Member) -> Attendance:
    """An attendance record belonging to Gym B."""
    from datetime import datetime, timezone
    att = Attendance(
        id=uuid4(), gym_id=gym_b.id, member_id=member_b.id,
        check_in_at=datetime.now(timezone.utc), check_in_date=date.today(),
        status=AttendanceStatus.CHECKED_IN, source=CheckInSource.MANUAL,
    )
    db_session.add(att)
    await db_session.flush()
    return att


@pytest.fixture
async def asset_b(db_session: AsyncSession, gym_b: Gym) -> Asset:
    """An asset belonging to Gym B."""
    asset = Asset(
        id=uuid4(), gym_id=gym_b.id, name="Secret Treadmill",
        asset_code=f"TR-{uuid4().hex[:6]}", category=AssetCategory.CARDIO,
        status=AssetStatus.ACTIVE,
    )
    db_session.add(asset)
    await db_session.flush()
    return asset


# ── Cross-Tenant Member Access Tests ─────────────────────────

class TestCrossTenantMembers:
    """Verify Gym A cannot access Gym B's members."""

    @pytest.mark.asyncio
    async def test_cannot_read_other_gym_member(
        self, client: AsyncClient, headers_a: dict, member_b: Member
    ):
        """Gym A owner should get 404 when trying to read Gym B's member."""
        resp = await client.get(f"/api/v1/members/{member_b.id}", headers=headers_a)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_update_other_gym_member(
        self, client: AsyncClient, headers_a: dict, member_b: Member
    ):
        """Gym A owner should get 404 when trying to update Gym B's member."""
        resp = await client.put(
            f"/api/v1/members/{member_b.id}",
            json={"name": "Hacked Name"},
            headers=headers_a,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_delete_other_gym_member(
        self, client: AsyncClient, headers_a: dict, member_b: Member
    ):
        """Gym A owner should get 404 when trying to delete Gym B's member."""
        resp = await client.delete(f"/api/v1/members/{member_b.id}", headers=headers_a)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_list_members_excludes_other_gym(
        self, client: AsyncClient, headers_a: dict, member_b: Member
    ):
        """Gym A's member list should never include Gym B's members."""
        resp = await client.get("/api/v1/members", headers=headers_a)
        assert resp.status_code == 200
        data = resp.json()
        member_ids = [m["id"] for m in data.get("members", data.get("items", []))]
        assert str(member_b.id) not in member_ids


# ── Cross-Tenant Payment Access Tests ────────────────────────

class TestCrossTenantPayments:
    """Verify Gym A cannot access Gym B's payments."""

    @pytest.mark.asyncio
    async def test_cannot_read_other_gym_payment(
        self, client: AsyncClient, headers_a: dict, payment_b: Payment
    ):
        """Gym A owner should get 404 when trying to read Gym B's payment."""
        resp = await client.get(f"/api/v1/payments/{payment_b.id}", headers=headers_a)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_create_payment_for_other_gym_member(
        self, client: AsyncClient, headers_a: dict, member_b: Member
    ):
        """Gym A owner should get 404 when creating a payment for Gym B's member."""
        resp = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(member_b.id),
                "amount_in_paise": 50000,
                "payment_method": "cash",
            },
            headers=headers_a,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_list_payments_excludes_other_gym(
        self, client: AsyncClient, headers_a: dict, payment_b: Payment
    ):
        """Gym A's payment list should never include Gym B's payments."""
        resp = await client.get("/api/v1/payments", headers=headers_a)
        assert resp.status_code == 200
        data = resp.json()
        payment_ids = [p["id"] for p in data.get("payments", data.get("items", []))]
        assert str(payment_b.id) not in payment_ids


# ── Cross-Tenant Attendance Access Tests ─────────────────────

class TestCrossTenantAttendance:
    """Verify Gym A cannot access Gym B's attendance records."""

    @pytest.mark.asyncio
    async def test_cannot_cancel_other_gym_attendance(
        self, client: AsyncClient, headers_a: dict, attendance_b: Attendance
    ):
        """Gym A should get 404 when cancelling Gym B's attendance."""
        resp = await client.post(
            f"/api/v1/attendance/{attendance_b.id}/cancel",
            headers=headers_a,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_today_attendance_excludes_other_gym(
        self, client: AsyncClient, headers_a: dict, attendance_b: Attendance
    ):
        """Gym A's today attendance should never include Gym B's records."""
        resp = await client.get("/api/v1/attendance/today", headers=headers_a)
        assert resp.status_code == 200
        data = resp.json()
        att_ids = [a["id"] for a in data.get("records", data.get("items", []))]
        assert str(attendance_b.id) not in att_ids


# ── Cross-Tenant Asset Access Tests ──────────────────────────

class TestCrossTenantAssets:
    """Verify Gym A cannot access Gym B's assets."""

    @pytest.mark.asyncio
    async def test_cannot_read_other_gym_asset(
        self, client: AsyncClient, headers_a: dict, asset_b: Asset
    ):
        """Gym A owner should get 404 when reading Gym B's asset."""
        resp = await client.get(f"/api/v1/assets/{asset_b.id}", headers=headers_a)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_delete_other_gym_asset(
        self, client: AsyncClient, headers_a: dict, asset_b: Asset
    ):
        """Gym A owner should get 404 when deleting Gym B's asset."""
        resp = await client.delete(f"/api/v1/assets/{asset_b.id}", headers=headers_a)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_list_assets_excludes_other_gym(
        self, client: AsyncClient, headers_a: dict, asset_b: Asset
    ):
        """Gym A's asset list should never include Gym B's assets."""
        resp = await client.get("/api/v1/assets", headers=headers_a)
        assert resp.status_code == 200
        data = resp.json()
        asset_ids = [a["id"] for a in data.get("assets", data.get("items", []))]
        assert str(asset_b.id) not in asset_ids


# ── Cross-Tenant Staff Access Tests ──────────────────────────

class TestCrossTenantStaff:
    """Verify Gym A owner cannot manage Gym B's staff."""

    @pytest.mark.asyncio
    async def test_cannot_read_other_gym_user_profile(
        self, client: AsyncClient, headers_a: dict, owner_b: User
    ):
        """Gym A owner hitting /auth/me sees their own profile, not Gym B's."""
        resp = await client.get("/api/v1/auth/me", headers=headers_a)
        assert resp.status_code == 200
        data = resp.json()
        # Should return Gym A's owner, not Gym B's
        assert data["id"] != str(owner_b.id)


# ── Role Escalation Tests ────────────────────────────────────

class TestRoleEscalation:
    """Verify users cannot escalate their own privileges."""

    @pytest.mark.asyncio
    async def test_staff_cannot_access_owner_endpoints(
        self, client: AsyncClient, db_session: AsyncSession, gym_a: Gym
    ):
        """A STAFF user should be rejected from owner-only endpoints."""
        staff = User(
            id=uuid4(), gym_id=gym_a.id, name="Staff User",
            email=f"staff-{uuid4().hex[:6]}@test.com", phone="9444444444",
            password_hash=hash_password("TestPass123"), role=UserRole.STAFF,
        )
        db_session.add(staff)
        await db_session.flush()

        token = create_access_token(staff.id, gym_a.id, staff.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        # Staff should not be able to access billing subscription management
        resp = await client.get("/api/v1/billing/subscription", headers=headers)
        # Staff CAN read subscription status, but cannot create/cancel
        # Test cancel which is owner-only
        resp = await client.post(
            "/api/v1/billing/cancel",
            json={"reason": "test"},
            headers=headers,
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_forged_gym_id_in_token_blocked(
        self, client: AsyncClient, gym_a: Gym, gym_b: Gym, owner_a: User
    ):
        """A token with Gym A user_id but Gym B gym_id should be rejected on /me."""
        # Forge a token that claims to be in Gym B but uses Gym A's user_id
        forged_token = create_access_token(owner_a.id, gym_b.id, "owner")
        headers = {"Authorization": f"Bearer {forged_token}"}

        resp = await client.get("/api/v1/auth/me", headers=headers)
        # Should fail because user_a.gym_id != gym_b.id
        assert resp.status_code in (401, 403)


# ── UUID Enumeration Tests ───────────────────────────────────

class TestUUIDEnumeration:
    """Verify that random UUIDs don't leak information."""

    @pytest.mark.asyncio
    async def test_nonexistent_member_returns_404(self, client: AsyncClient, headers_a: dict):
        """A random UUID should return 404, not 500 or leak info."""
        fake_id = str(uuid4())
        resp = await client.get(f"/api/v1/members/{fake_id}", headers=headers_a)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_nonexistent_payment_returns_404(self, client: AsyncClient, headers_a: dict):
        fake_id = str(uuid4())
        resp = await client.get(f"/api/v1/payments/{fake_id}", headers=headers_a)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_nonexistent_asset_returns_404(self, client: AsyncClient, headers_a: dict):
        fake_id = str(uuid4())
        resp = await client.get(f"/api/v1/assets/{fake_id}", headers=headers_a)
        assert resp.status_code == 404
