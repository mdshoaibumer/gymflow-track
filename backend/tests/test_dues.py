"""
Integration tests for Due Management.

Tests:
- Auto-due creation when partial payment is recorded against a known plan
- No due created for full payments (with or without discount)
- Due payment (partial and full settlement)
- Due waiver (owner only)
- Void reversal (voiding a payment restores due balance)
- Aging report and summary
- Member dues listing
- Overpayment prevention
- Tenant isolation (Gym A cannot see Gym B dues)
- RBAC restrictions
"""

import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.models.membership_plan import GymMembershipPlan
from app.models.user import User, UserRole
from app.core.security import create_access_token, hash_password
from app.core.cache import get_cache_backend


# === Fixtures ===


@pytest.fixture
async def quarterly_plan(db_session: AsyncSession, sample_gym: Gym) -> GymMembershipPlan:
    """A Quarterly plan at ₹3,000 for the sample gym."""
    plan = GymMembershipPlan(
        id=uuid.uuid4(),
        gym_id=sample_gym.id,
        name="Quarterly",
        duration_months=3,
        amount=3000,  # rupees
        is_active=True,
    )
    db_session.add(plan)
    await db_session.flush()
    return plan


@pytest.fixture
async def monthly_plan(db_session: AsyncSession, sample_gym: Gym) -> GymMembershipPlan:
    """A Monthly plan at ₹1,000 for the sample gym."""
    plan = GymMembershipPlan(
        id=uuid.uuid4(),
        gym_id=sample_gym.id,
        name="Monthly",
        duration_months=1,
        amount=1000,  # rupees
        is_active=True,
    )
    db_session.add(plan)
    await db_session.flush()
    return plan


@pytest.fixture
async def due_member(db_session: AsyncSession, sample_gym: Gym) -> Member:
    """A member in the sample gym for due tests."""
    member = Member(
        id=uuid.uuid4(),
        gym_id=sample_gym.id,
        name="Due Test Member",
        phone="9876500200",
        membership_status=MembershipStatus.ACTIVE,
        membership_start=date.today(),
        membership_end=date.today() + timedelta(days=90),
        membership_plan="Quarterly",
        amount_paid=0,
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
        name="Other Gym Due Member",
        phone="9000000002",
        membership_status=MembershipStatus.ACTIVE,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def staff_user(db_session: AsyncSession, sample_gym: Gym) -> User:
    """A STAFF user for RBAC tests (cannot waive dues)."""
    user = User(
        id=uuid.uuid4(),
        gym_id=sample_gym.id,
        name="Staff User",
        email="staff@testgym.com",
        phone="9876500300",
        password_hash=hash_password("TestPass123"),
        role=UserRole.STAFF,
    )
    db_session.add(user)
    await db_session.flush()
    cache = get_cache_backend()
    cache.set(f"user_active:{user.id}", "1", 99999)
    cache.set(f"user_revoked_at:{user.id}", "", 99999)
    return user


@pytest.fixture
def staff_headers(staff_user: User, sample_gym: Gym) -> dict[str, str]:
    """Auth headers for a STAFF user."""
    token = create_access_token(staff_user.id, sample_gym.id, staff_user.role.value)
    return {"Authorization": f"Bearer {token}"}


# === Test Auto-Due Creation ===


class TestAutoDueCreation:
    """Test that dues are automatically created when a partial payment is recorded."""

    async def test_partial_payment_creates_due(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """₹2,000 payment on ₹3,000 Quarterly plan → due with ₹1,000 balance."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(due_member.id),
                "amount_in_paise": 200000,  # ₹2,000
                "payment_method": "cash",
                "membership_plan": "Quarterly",
                "membership_end": str(date.today() + timedelta(days=90)),
            },
            headers=auth_headers,
        )
        assert response.status_code == 201

        # Check that a due was created
        dues_response = await client.get(
            f"/api/v1/dues/member/{due_member.id}",
            headers=auth_headers,
        )
        assert dues_response.status_code == 200
        dues = dues_response.json()
        assert len(dues) == 1

        due = dues[0]
        assert due["plan_name"] == "Quarterly"
        assert due["plan_amount_paise"] == 300000   # ₹3,000
        assert due["discount_paise"] == 0
        assert due["effective_amount_paise"] == 300000
        assert due["total_paid_paise"] == 200000    # ₹2,000
        assert due["balance_paise"] == 100000       # ₹1,000
        assert due["status"] == "partial"

    async def test_full_payment_no_due(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """₹3,000 payment on ₹3,000 plan → no due created."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(due_member.id),
                "amount_in_paise": 300000,  # ₹3,000
                "payment_method": "upi",
                "membership_plan": "Quarterly",
                "membership_end": str(date.today() + timedelta(days=90)),
            },
            headers=auth_headers,
        )
        assert response.status_code == 201

        dues_response = await client.get(
            f"/api/v1/dues/member/{due_member.id}",
            headers=auth_headers,
        )
        assert dues_response.status_code == 200
        assert len(dues_response.json()) == 0

    async def test_discount_full_payment_no_due(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """₹3,000 plan, ₹200 discount, ₹2,800 paid → no due (negotiated price)."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(due_member.id),
                "amount_in_paise": 280000,  # ₹2,800
                "discount_in_paise": 20000,  # ₹200 discount
                "payment_method": "cash",
                "membership_plan": "Quarterly",
                "membership_end": str(date.today() + timedelta(days=90)),
            },
            headers=auth_headers,
        )
        assert response.status_code == 201

        dues_response = await client.get(
            f"/api/v1/dues/member/{due_member.id}",
            headers=auth_headers,
        )
        assert dues_response.status_code == 200
        assert len(dues_response.json()) == 0

    async def test_discount_partial_payment_creates_correct_due(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """₹3,000 plan, ₹200 discount, ₹2,000 paid → due with ₹800 balance."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(due_member.id),
                "amount_in_paise": 200000,  # ₹2,000
                "discount_in_paise": 20000,  # ₹200 discount
                "payment_method": "upi",
                "membership_plan": "Quarterly",
                "membership_end": str(date.today() + timedelta(days=90)),
            },
            headers=auth_headers,
        )
        assert response.status_code == 201

        dues_response = await client.get(
            f"/api/v1/dues/member/{due_member.id}",
            headers=auth_headers,
        )
        assert dues_response.status_code == 200
        dues = dues_response.json()
        assert len(dues) == 1

        due = dues[0]
        assert due["plan_amount_paise"] == 300000   # ₹3,000 list price
        assert due["discount_paise"] == 20000       # ₹200 discount
        assert due["effective_amount_paise"] == 280000  # ₹2,800 effective
        assert due["total_paid_paise"] == 200000    # ₹2,000 paid
        assert due["balance_paise"] == 80000        # ₹800 balance

    async def test_no_due_for_unknown_plan(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
    ):
        """Payment with a plan name not in gym_membership_plans → no due created."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(due_member.id),
                "amount_in_paise": 100000,
                "payment_method": "cash",
                "membership_plan": "NonExistentPlan",
                "membership_end": str(date.today() + timedelta(days=30)),
            },
            headers=auth_headers,
        )
        assert response.status_code == 201

        dues_response = await client.get(
            f"/api/v1/dues/member/{due_member.id}",
            headers=auth_headers,
        )
        assert dues_response.status_code == 200
        assert len(dues_response.json()) == 0

    async def test_no_due_without_plan_name(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
    ):
        """Payment without membership_plan → no due created."""
        response = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(due_member.id),
                "amount_in_paise": 100000,
                "payment_method": "cash",
            },
            headers=auth_headers,
        )
        assert response.status_code == 201

        dues_response = await client.get(
            f"/api/v1/dues/member/{due_member.id}",
            headers=auth_headers,
        )
        assert dues_response.status_code == 200
        assert len(dues_response.json()) == 0


# === Test Due Payment ===


class TestDuePayment:
    """Test recording payments against outstanding dues."""

    async def _create_due(
        self, client, auth_headers, member_id, plan_name="Quarterly"
    ) -> dict:
        """Helper: create a partial payment → auto-creates a due, returns the due."""
        await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(member_id),
                "amount_in_paise": 200000,
                "payment_method": "cash",
                "membership_plan": plan_name,
                "membership_end": str(date.today() + timedelta(days=90)),
            },
            headers=auth_headers,
        )
        resp = await client.get(
            f"/api/v1/dues/member/{member_id}",
            headers=auth_headers,
        )
        dues = resp.json()
        return dues[0]

    async def test_partial_due_payment(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """Pay ₹500 against ₹1,000 due → balance becomes ₹500."""
        due = await self._create_due(client, auth_headers, due_member.id)
        assert due["balance_paise"] == 100000  # ₹1,000

        response = await client.post(
            f"/api/v1/dues/{due['id']}/pay",
            json={
                "amount_in_paise": 50000,  # ₹500
                "payment_method": "upi",
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["total_paid_paise"] == 250000   # ₹2,000 + ₹500
        assert data["balance_paise"] == 50000       # ₹500 remaining
        assert data["status"] == "partial"

    async def test_full_due_settlement(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """Pay remaining ₹1,000 → due status becomes 'paid'."""
        due = await self._create_due(client, auth_headers, due_member.id)

        response = await client.post(
            f"/api/v1/dues/{due['id']}/pay",
            json={
                "amount_in_paise": 100000,  # ₹1,000 (exact balance)
                "payment_method": "cash",
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["balance_paise"] == 0
        assert data["status"] == "paid"

    async def test_overpayment_rejected(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """Payment exceeding balance is rejected."""
        due = await self._create_due(client, auth_headers, due_member.id)

        response = await client.post(
            f"/api/v1/dues/{due['id']}/pay",
            json={
                "amount_in_paise": 200000,  # ₹2,000 > ₹1,000 balance
                "payment_method": "cash",
            },
            headers=auth_headers,
        )
        assert response.status_code == 422 or response.status_code == 400

    async def test_payment_on_paid_due_rejected(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """Cannot pay against a fully settled due."""
        due = await self._create_due(client, auth_headers, due_member.id)

        # Fully settle
        await client.post(
            f"/api/v1/dues/{due['id']}/pay",
            json={"amount_in_paise": 100000, "payment_method": "cash"},
            headers=auth_headers,
        )

        # Try to pay again
        response = await client.post(
            f"/api/v1/dues/{due['id']}/pay",
            json={"amount_in_paise": 10000, "payment_method": "cash"},
            headers=auth_headers,
        )
        assert response.status_code == 422 or response.status_code == 400


# === Test Due Waiver ===


class TestDueWaiver:
    """Test waiving (writing off) dues."""

    async def _create_due(self, client, auth_headers, member_id) -> dict:
        await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(member_id),
                "amount_in_paise": 200000,
                "payment_method": "cash",
                "membership_plan": "Quarterly",
                "membership_end": str(date.today() + timedelta(days=90)),
            },
            headers=auth_headers,
        )
        resp = await client.get(
            f"/api/v1/dues/member/{member_id}",
            headers=auth_headers,
        )
        return resp.json()[0]

    async def test_owner_can_waive_due(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """OWNER can waive a due → status becomes 'waived', balance = 0."""
        due = await self._create_due(client, auth_headers, due_member.id)

        response = await client.post(
            f"/api/v1/dues/{due['id']}/waive",
            json={"reason": "Member is a long-term loyal customer, waiving balance"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "waived"
        assert data["balance_paise"] == 0
        assert data["waive_reason"] is not None

    async def test_staff_cannot_waive_due(
        self,
        client: AsyncClient,
        staff_headers: dict,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """STAFF cannot waive a due (requires OWNER)."""
        due = await self._create_due(client, auth_headers, due_member.id)

        response = await client.post(
            f"/api/v1/dues/{due['id']}/waive",
            json={"reason": "Some reason"},
            headers=staff_headers,
        )
        assert response.status_code == 403

    async def test_cannot_waive_paid_due(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """Cannot waive a due that is already paid."""
        due = await self._create_due(client, auth_headers, due_member.id)

        # Pay it off
        await client.post(
            f"/api/v1/dues/{due['id']}/pay",
            json={"amount_in_paise": 100000, "payment_method": "cash"},
            headers=auth_headers,
        )

        # Try to waive
        response = await client.post(
            f"/api/v1/dues/{due['id']}/waive",
            json={"reason": "Trying to waive a paid due"},
            headers=auth_headers,
        )
        assert response.status_code == 422 or response.status_code == 400


# === Test Void Reversal ===


class TestVoidReversal:
    """Test that voiding a payment restores the due balance."""

    async def test_void_restores_due_balance(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
        db_session: AsyncSession,
    ):
        """Voiding the initial payment restores the due to pending state."""
        # Record partial payment (creates due)
        pay_resp = await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(due_member.id),
                "amount_in_paise": 200000,
                "payment_method": "cash",
                "membership_plan": "Quarterly",
                "membership_end": str(date.today() + timedelta(days=90)),
            },
            headers=auth_headers,
        )
        payment_id = pay_resp.json()["id"]

        # Verify due exists
        dues_resp = await client.get(
            f"/api/v1/dues/member/{due_member.id}",
            headers=auth_headers,
        )
        dues = dues_resp.json()
        assert len(dues) == 1
        due_id = dues[0]["id"]
        assert dues[0]["total_paid_paise"] == 200000
        assert dues[0]["balance_paise"] == 100000

        # Void the payment
        void_resp = await client.post(
            f"/api/v1/payments/{payment_id}/void",
            json={"reason": "Customer wants to change plan"},
            headers=auth_headers,
        )
        assert void_resp.status_code == 200

        # Check due balance is restored
        due_detail = await client.get(
            f"/api/v1/dues/{due_id}",
            headers=auth_headers,
        )
        assert due_detail.status_code == 200
        data = due_detail.json()
        assert data["total_paid_paise"] == 0
        assert data["balance_paise"] == 300000  # Full plan amount restored
        assert data["status"] == "pending"


# === Test Listings and Reports ===


class TestDueListingsAndReports:
    """Test listing dues, summary, aging report."""

    async def _create_due(self, client, auth_headers, member_id) -> dict:
        await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(member_id),
                "amount_in_paise": 200000,
                "payment_method": "cash",
                "membership_plan": "Quarterly",
                "membership_end": str(date.today() + timedelta(days=90)),
            },
            headers=auth_headers,
        )
        resp = await client.get(
            f"/api/v1/dues/member/{member_id}",
            headers=auth_headers,
        )
        return resp.json()[0]

    async def test_list_outstanding_dues(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """List returns outstanding dues with total."""
        await self._create_due(client, auth_headers, due_member.id)

        response = await client.get(
            "/api/v1/dues",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert data["total_outstanding_paise"] >= 100000

    async def test_summary_endpoint(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """Summary returns member count and total outstanding."""
        await self._create_due(client, auth_headers, due_member.id)

        response = await client.get(
            "/api/v1/dues/summary",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_members_with_dues"] >= 1
        assert data["total_outstanding_paise"] >= 100000
        assert "collected_this_month_paise" in data

    async def test_aging_report(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """Aging report returns bucketed data."""
        await self._create_due(client, auth_headers, due_member.id)

        response = await client.get(
            "/api/v1/dues/aging-report",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "buckets" in data
        assert "total_outstanding_paise" in data
        # Should have all expected bucket ranges
        bucket_ranges = [b["range"] for b in data["buckets"]]
        assert "not_yet_due" in bucket_ranges
        assert "0-30" in bucket_ranges
        assert "31-60" in bucket_ranges
        assert "61-90" in bucket_ranges
        assert "90+" in bucket_ranges

    async def test_due_detail_with_payments(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """Due detail includes linked payment records."""
        due = await self._create_due(client, auth_headers, due_member.id)

        response = await client.get(
            f"/api/v1/dues/{due['id']}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "payments" in data
        assert len(data["payments"]) == 1  # The initial partial payment
        assert data["payments"][0]["amount_paise"] == 200000

    async def test_member_dues_shows_all_statuses(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """Member dues endpoint shows dues of all statuses."""
        due = await self._create_due(client, auth_headers, due_member.id)

        # Settle the due
        await client.post(
            f"/api/v1/dues/{due['id']}/pay",
            json={"amount_in_paise": 100000, "payment_method": "upi"},
            headers=auth_headers,
        )

        response = await client.get(
            f"/api/v1/dues/member/{due_member.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        dues = response.json()
        assert len(dues) == 1
        assert dues[0]["status"] == "paid"


# === Test Tenant Isolation ===


class TestDueTenantIsolation:
    """Test that gyms cannot see each other's dues."""

    async def test_cannot_see_other_gym_dues(
        self,
        client: AsyncClient,
        auth_headers: dict,
        other_user: User,
        other_gym: Gym,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """Gym A's dues are not visible to Gym B."""
        # Create a due in gym A
        await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(due_member.id),
                "amount_in_paise": 200000,
                "payment_method": "cash",
                "membership_plan": "Quarterly",
                "membership_end": str(date.today() + timedelta(days=90)),
            },
            headers=auth_headers,
        )

        # Try to list dues as gym B owner
        other_token = create_access_token(
            other_user.id, other_gym.id, other_user.role.value
        )
        other_headers = {"Authorization": f"Bearer {other_token}"}

        response = await client.get(
            "/api/v1/dues",
            headers=other_headers,
        )
        assert response.status_code == 200
        data = response.json()
        # Gym B should have zero dues
        assert data["total"] == 0

    async def test_cannot_pay_other_gym_due(
        self,
        client: AsyncClient,
        auth_headers: dict,
        other_user: User,
        other_gym: Gym,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """Gym B cannot record payment against Gym A's due."""
        # Create a due in gym A
        await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(due_member.id),
                "amount_in_paise": 200000,
                "payment_method": "cash",
                "membership_plan": "Quarterly",
                "membership_end": str(date.today() + timedelta(days=90)),
            },
            headers=auth_headers,
        )
        dues_resp = await client.get(
            f"/api/v1/dues/member/{due_member.id}",
            headers=auth_headers,
        )
        due_id = dues_resp.json()[0]["id"]

        # Try to pay as gym B
        other_token = create_access_token(
            other_user.id, other_gym.id, other_user.role.value
        )
        other_headers = {"Authorization": f"Bearer {other_token}"}

        response = await client.post(
            f"/api/v1/dues/{due_id}/pay",
            json={"amount_in_paise": 50000, "payment_method": "cash"},
            headers=other_headers,
        )
        assert response.status_code == 404


# === Test RBAC ===


class TestDueRBAC:
    """Test role-based access control for due endpoints."""

    async def test_staff_cannot_list_dues(
        self,
        client: AsyncClient,
        staff_headers: dict,
    ):
        """STAFF cannot access dues (requires ADMIN/OWNER)."""
        response = await client.get(
            "/api/v1/dues",
            headers=staff_headers,
        )
        assert response.status_code == 403

    async def test_unauthenticated_cannot_access_dues(
        self,
        client: AsyncClient,
    ):
        """No auth token → 401/403."""
        response = await client.get("/api/v1/dues")
        assert response.status_code in (401, 403)


# === Test Multiple Partial Payments ===


class TestMultiplePartialPayments:
    """Test the ₹3,000 → ₹2,000 now + ₹500 later + ₹500 later flow."""

    async def test_three_step_settlement(
        self,
        client: AsyncClient,
        auth_headers: dict,
        due_member: Member,
        quarterly_plan: GymMembershipPlan,
    ):
        """Multiple partial payments eventually settle the due."""
        # Step 1: Pay ₹2,000 (creates due with ₹1,000 balance)
        await client.post(
            "/api/v1/payments",
            json={
                "member_id": str(due_member.id),
                "amount_in_paise": 200000,
                "payment_method": "cash",
                "membership_plan": "Quarterly",
                "membership_end": str(date.today() + timedelta(days=90)),
            },
            headers=auth_headers,
        )

        dues_resp = await client.get(
            f"/api/v1/dues/member/{due_member.id}",
            headers=auth_headers,
        )
        due = dues_resp.json()[0]
        due_id = due["id"]
        assert due["balance_paise"] == 100000  # ₹1,000

        # Step 2: Pay ₹500
        resp2 = await client.post(
            f"/api/v1/dues/{due_id}/pay",
            json={"amount_in_paise": 50000, "payment_method": "upi"},
            headers=auth_headers,
        )
        assert resp2.status_code == 201
        data2 = resp2.json()
        assert data2["balance_paise"] == 50000  # ₹500 remaining
        assert data2["status"] == "partial"

        # Step 3: Pay remaining ₹500
        resp3 = await client.post(
            f"/api/v1/dues/{due_id}/pay",
            json={"amount_in_paise": 50000, "payment_method": "cash"},
            headers=auth_headers,
        )
        assert resp3.status_code == 201
        data3 = resp3.json()
        assert data3["balance_paise"] == 0
        assert data3["status"] == "paid"
        assert data3["total_paid_paise"] == 300000  # ₹3,000 total

        # Verify detail shows 3 linked payments (initial + 2 dues)
        detail_resp = await client.get(
            f"/api/v1/dues/{due_id}",
            headers=auth_headers,
        )
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert len(detail["payments"]) == 3
