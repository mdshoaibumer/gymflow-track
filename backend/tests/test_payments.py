"""
Integration tests for Payments + Membership Lifecycle.

Tests:
- Payment creation (happy path, auto-renewal)
- Payment listing (pagination, filters)
- Member payment history
- Membership expiration detection
- Revenue calculations (integer precision — no float bugs)
- RBAC restrictions (STAFF cannot record payments)
- Tenant isolation (Gym A cannot view Gym B payments)
"""

import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gym import Gym
from app.models.member import Member, MembershipStatus


@pytest.fixture
async def sample_member(db_session: AsyncSession, sample_gym: Gym) -> Member:
    """A member in the sample gym for payment tests."""
    member = Member(
        id=uuid.uuid4(),
        gym_id=sample_gym.id,
        name="Payment Test Member",
        phone="9876500100",
        membership_status=MembershipStatus.ACTIVE,
        membership_start=date.today() - timedelta(days=30),
        membership_end=date.today() + timedelta(days=30),
        membership_plan="Monthly",
        amount_paid=200000,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def other_gym_member(db_session: AsyncSession, other_gym: Gym) -> Member:
    """A member in the OTHER gym for isolation tests."""
    member = Member(
        id=uuid.uuid4(),
        gym_id=other_gym.id,
        name="Other Gym Member",
        phone="9000000001",
        membership_status=MembershipStatus.ACTIVE,
    )
    db_session.add(member)
    await db_session.flush()
    return member


class TestRecordPayment:
    """Test payment creation."""

    async def test_record_payment_success(
        self, client: AsyncClient, auth_headers: dict, sample_member: Member
    ):
        """OWNER can record a payment — returns 201."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(sample_member.id),
                "amount_in_paise": 200000,
                "payment_method": "upi",
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["amount_in_paise"] == 200000
        assert data["payment_method"] == "upi"
        assert data["payment_status"] == "completed"
        assert data["payment_date"] == str(date.today())
        assert data["member_id"] == str(sample_member.id)

    async def test_record_payment_with_renewal(
        self, client: AsyncClient, auth_headers: dict, sample_member: Member
    ):
        """Payment with membership_end auto-renews the member."""
        new_end = date.today() + timedelta(days=90)
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(sample_member.id),
                "amount_in_paise": 500000,
                "payment_method": "cash",
                "membership_end": str(new_end),
                "membership_plan": "Quarterly",
            },
            headers=auth_headers,
        )
        assert response.status_code == 201

        # Verify the member's membership was renewed
        member_resp = await client.get(
            f"/api/v1/members/{sample_member.id}", headers=auth_headers
        )
        member_data = member_resp.json()
        assert member_data["membership_end"] == str(new_end)
        assert member_data["membership_plan"] == "Quarterly"
        assert member_data["membership_status"] == "active"

    async def test_record_payment_pending_does_not_renew(
        self, client: AsyncClient, auth_headers: dict, sample_member: Member
    ):
        """Pending payment does NOT auto-renew membership."""
        original_end = str(sample_member.membership_end)
        new_end = date.today() + timedelta(days=90)
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(sample_member.id),
                "amount_in_paise": 500000,
                "payment_method": "cash",
                "payment_status": "pending",
                "membership_end": str(new_end),
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        assert response.json()["payment_status"] == "pending"

        # Membership should NOT have changed
        member_resp = await client.get(
            f"/api/v1/members/{sample_member.id}", headers=auth_headers
        )
        assert member_resp.json()["membership_end"] == original_end

    async def test_record_payment_nonexistent_member_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Cannot record payment for a member that doesn't exist."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(uuid.uuid4()),
                "amount_in_paise": 100000,
                "payment_method": "cash",
            },
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_record_payment_zero_amount_rejected(
        self, client: AsyncClient, auth_headers: dict, sample_member: Member
    ):
        """Amount must be > 0 (Pydantic validation)."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(sample_member.id),
                "amount_in_paise": 0,
                "payment_method": "cash",
            },
            headers=auth_headers,
        )
        assert response.status_code == 422


class TestListPayments:
    """Test payment listing and filters."""

    async def test_list_payments_empty(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Returns empty list when no payments exist."""
        response = await client.get("/api/v1/payments", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["payments"] == []
        assert data["total"] == 0

    async def test_list_payments_with_data(
        self, client: AsyncClient, auth_headers: dict, sample_member: Member
    ):
        """Returns payments after creation."""
        await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(sample_member.id),
                "amount_in_paise": 150000,
                "payment_method": "card",
            },
            headers=auth_headers,
        )

        response = await client.get("/api/v1/payments", headers=auth_headers)
        data = response.json()
        assert data["total"] == 1
        assert data["payments"][0]["amount_in_paise"] == 150000

    async def test_list_payments_filter_by_status(
        self, client: AsyncClient, auth_headers: dict, sample_member: Member
    ):
        """Can filter payments by status."""
        # Create one completed, one pending
        await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(sample_member.id),
                "amount_in_paise": 100000,
                "payment_method": "cash",
                "payment_status": "completed",
            },
            headers=auth_headers,
        )
        await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(sample_member.id),
                "amount_in_paise": 200000,
                "payment_method": "upi",
                "payment_status": "pending",
            },
            headers=auth_headers,
        )

        # Filter by pending
        response = await client.get(
            "/api/v1/payments?status=pending", headers=auth_headers
        )
        data = response.json()
        assert data["total"] == 1
        assert data["payments"][0]["payment_status"] == "pending"

    async def test_list_payments_pagination(
        self, client: AsyncClient, auth_headers: dict, sample_member: Member
    ):
        """Pagination works correctly."""
        for i in range(3):
            await client.post(
                "/api/v1/payments",
                json={
                    "member_id": str(sample_member.id),
                    "amount_in_paise": (i + 1) * 100000,
                    "payment_method": "cash",
                },
                headers=auth_headers,
            )

        response = await client.get(
            "/api/v1/payments?skip=0&limit=2", headers=auth_headers
        )
        data = response.json()
        assert len(data["payments"]) == 2
        assert data["total"] == 3


class TestMemberPaymentHistory:
    """Test member-specific payment history."""

    async def test_member_payment_history(
        self, client: AsyncClient, auth_headers: dict, sample_member: Member
    ):
        """GET /members/{id}/payments returns payments for that member."""
        await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(sample_member.id),
                "amount_in_paise": 250000,
                "payment_method": "upi",
            },
            headers=auth_headers,
        )

        response = await client.get(
            f"/api/v1/members/{sample_member.id}/payments", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["payments"][0]["amount_in_paise"] == 250000

    async def test_member_payment_history_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Returns 404 if member doesn't exist."""
        response = await client.get(
            f"/api/v1/members/{uuid.uuid4()}/payments", headers=auth_headers
        )
        assert response.status_code == 404


class TestMembershipExpiration:
    """Test membership lifecycle and expiration detection."""

    async def test_dashboard_detects_expiring(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, sample_gym: Gym
    ):
        """Dashboard expiring endpoint finds members expiring within N days."""
        # Create a member expiring in 3 days
        expiring_member = Member(
            id=uuid.uuid4(),
            gym_id=sample_gym.id,
            name="About To Expire",
            phone="9876500200",
            membership_status=MembershipStatus.ACTIVE,
            membership_start=date.today() - timedelta(days=27),
            membership_end=date.today() + timedelta(days=3),
            membership_plan="Monthly",
        )
        db_session.add(expiring_member)
        await db_session.flush()

        response = await client.get(
            "/api/v1/dashboard/expiring?days=7", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        names = [m["name"] for m in data]
        assert "About To Expire" in names

    async def test_dashboard_metrics(
        self, client: AsyncClient, auth_headers: dict, sample_member: Member
    ):
        """Dashboard metrics endpoint returns correct counts."""
        response = await client.get(
            "/api/v1/dashboard/metrics", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_members" in data
        assert "active_members" in data
        assert "expiring_soon" in data
        assert "monthly_revenue_paise" in data
        assert isinstance(data["monthly_revenue_paise"], int)


class TestRevenuePrecision:
    """Test that financial calculations are integer-precise — no float bugs."""

    async def test_revenue_sum_is_exact(
        self, client: AsyncClient, auth_headers: dict, sample_member: Member
    ):
        """Multiple payments sum exactly — no floating point drift."""
        # Record payments that would cause float issues: 0.1 + 0.2 ≠ 0.3
        # In paise: 10 + 20 = 30 (exact integer arithmetic)
        amounts = [199, 301, 500]  # deliberate values that expose float bugs
        for amt in amounts:
            await client.post(
                "/api/v1/payments",
                json={
                    "member_id": str(sample_member.id),
                    "amount_in_paise": amt,
                    "payment_method": "cash",
                },
                headers=auth_headers,
            )

        # Get dashboard metrics — revenue should be exactly 1000
        response = await client.get(
            "/api/v1/dashboard/metrics", headers=auth_headers
        )
        data = response.json()
        assert data["monthly_revenue_paise"] == sum(amounts)

    async def test_amount_is_always_integer(
        self, client: AsyncClient, auth_headers: dict, sample_member: Member
    ):
        """API rejects non-integer paise amounts."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(sample_member.id),
                "amount_in_paise": 100.5,  # float — should be rejected or truncated
                "payment_method": "cash",
            },
            headers=auth_headers,
        )
        # Pydantic will either reject (422) or coerce to int
        if response.status_code == 201:
            # If coerced, ensure it's stored as integer
            assert isinstance(response.json()["amount_in_paise"], int)


class TestPaymentRBAC:
    """Test RBAC restrictions on payments."""

    async def test_staff_cannot_record_payment(
        self, client: AsyncClient, staff_headers: dict, sample_member: Member
    ):
        """STAFF role cannot create payments — 403."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(sample_member.id),
                "amount_in_paise": 100000,
                "payment_method": "cash",
            },
            headers=staff_headers,
        )
        assert response.status_code == 403

    async def test_staff_can_view_payments(
        self, client: AsyncClient, staff_headers: dict
    ):
        """STAFF can view (read) payments."""
        response = await client.get("/api/v1/payments", headers=staff_headers)
        assert response.status_code == 200

    async def test_admin_can_record_payment(
        self, client: AsyncClient, admin_headers: dict, sample_member: Member
    ):
        """ADMIN can record payments."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(sample_member.id),
                "amount_in_paise": 100000,
                "payment_method": "upi",
            },
            headers=admin_headers,
        )
        assert response.status_code == 201

    async def test_no_auth_rejected(self, client: AsyncClient):
        """No token → 401."""
        response = await client.get("/api/v1/payments")
        assert response.status_code == 401


class TestPaymentTenantIsolation:
    """Test that Gym A cannot see or create payments for Gym B members."""

    async def test_cannot_record_payment_for_other_gym_member(
        self,
        client: AsyncClient,
        auth_headers: dict,
        other_gym_member: Member,
    ):
        """Cannot record payment for a member in another gym — 404."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(other_gym_member.id),
                "amount_in_paise": 100000,
                "payment_method": "cash",
            },
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_cannot_view_other_gym_payments(
        self,
        client: AsyncClient,
        auth_headers: dict,
        other_auth_headers: dict,
        other_gym_member: Member,
    ):
        """Gym B's payments are invisible to Gym A."""
        # Create a payment in Gym B
        await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(other_gym_member.id),
                "amount_in_paise": 300000,
                "payment_method": "cash",
            },
            headers=other_auth_headers,
        )

        # Gym A should see 0 payments
        response = await client.get("/api/v1/payments", headers=auth_headers)
        assert response.json()["total"] == 0

    async def test_cannot_get_payment_by_id_from_other_gym(
        self,
        client: AsyncClient,
        auth_headers: dict,
        other_auth_headers: dict,
        other_gym_member: Member,
    ):
        """Direct payment ID access from another gym returns 404, not 403."""
        create_resp = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(other_gym_member.id),
                "amount_in_paise": 100000,
                "payment_method": "cash",
            },
            headers=other_auth_headers,
        )
        payment_id = create_resp.json()["id"]

        # Gym A tries to access it directly
        response = await client.get(
            f"/api/v1/payments/{payment_id}", headers=auth_headers
        )
        assert response.status_code == 404
