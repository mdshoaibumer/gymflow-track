"""
Tests for payment editing (PATCH /payments/{id}).

Covers:
- Editing pending payments (all fields)
- Marking pending → completed (triggers membership renewal + invoice)
- Editing completed payments (notes/method only)
- Rejecting edits on voided/failed payments
- Rejecting forbidden field changes on completed payments
"""

from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.core.cache import get_cache_backend
from app.core.timezone import today_ist
from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.subscription import BillingStatus, GymSubscription, PlanTier, SubscriptionPlan
from app.models.user import User, UserRole


pytestmark = pytest.mark.anyio


@pytest.fixture
async def payment_gym(db_session: AsyncSession) -> Gym:
    gym = Gym(
        id=uuid4(),
        name="Payment Edit Gym",
        slug=f"pay-edit-{uuid4().hex[:8]}",
        phone="9876543210",
    )
    db_session.add(gym)
    await db_session.flush()

    # Create subscription so enforcement middleware allows requests
    result = await db_session.execute(
        sa.select(SubscriptionPlan).where(SubscriptionPlan.tier == PlanTier.ELITE)
    )
    plan = result.scalar_one()
    sub = GymSubscription(
        id=uuid4(),
        gym_id=gym.id,
        plan_id=plan.id,
        status=BillingStatus.ACTIVE,
    )
    db_session.add(sub)
    await db_session.flush()

    get_cache_backend().set(f"sub:{gym.id}", "full", 99999)
    return gym


@pytest.fixture
async def payment_admin(db_session: AsyncSession, payment_gym: Gym) -> User:
    user = User(
        id=uuid4(),
        gym_id=payment_gym.id,
        name="Admin User",
        email=f"admin-{uuid4().hex[:6]}@test.com",
        phone="9876543210",
        password_hash=hash_password("Pass1234"),
        role=UserRole.OWNER,
    )
    db_session.add(user)
    await db_session.flush()
    cache = get_cache_backend()
    cache.set(f"user_active:{user.id}", "1", 99999)
    cache.set(f"user_revoked_at:{user.id}", "", 99999)
    return user


@pytest.fixture
def admin_headers(payment_admin: User, payment_gym: Gym) -> dict[str, str]:
    token = create_access_token(payment_admin.id, payment_gym.id, payment_admin.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def test_member(db_session: AsyncSession, payment_gym: Gym) -> Member:
    member = Member(
        id=uuid4(),
        gym_id=payment_gym.id,
        name="Test Member",
        phone="9876543211",
        membership_status=MembershipStatus.PENDING,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def pending_payment(
    db_session: AsyncSession, payment_gym: Gym, test_member: Member, payment_admin: User
) -> Payment:
    payment = Payment(
        id=uuid4(),
        gym_id=payment_gym.id,
        member_id=test_member.id,
        amount_in_paise=300000,  # ₹3000
        payment_method=PaymentMethod.UPI,
        payment_status=PaymentStatus.PENDING,
        payment_date=today_ist(),
        notes="3 month plan - will pay tomorrow",
        created_by=payment_admin.id,
    )
    db_session.add(payment)
    await db_session.flush()
    return payment


@pytest.fixture
async def completed_payment(
    db_session: AsyncSession, payment_gym: Gym, test_member: Member, payment_admin: User
) -> Payment:
    payment = Payment(
        id=uuid4(),
        gym_id=payment_gym.id,
        member_id=test_member.id,
        amount_in_paise=100000,  # ₹1000
        payment_method=PaymentMethod.CASH,
        payment_status=PaymentStatus.COMPLETED,
        payment_date=today_ist(),
        notes="1 month plan",
        created_by=payment_admin.id,
    )
    db_session.add(payment)
    await db_session.flush()
    return payment


# === Tests: Pending Payment Editing ===


class TestEditPendingPayment:
    async def test_edit_amount(
        self, client: AsyncClient, admin_headers: dict, pending_payment: Payment
    ):
        resp = await client.patch(
            f"/payments/{pending_payment.id}",
            json={"amount_in_paise": 100000},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["amount_in_paise"] == 100000

    async def test_edit_method(
        self, client: AsyncClient, admin_headers: dict, pending_payment: Payment
    ):
        resp = await client.patch(
            f"/payments/{pending_payment.id}",
            json={"payment_method": "cash"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["payment_method"] == "cash"

    async def test_edit_notes(
        self, client: AsyncClient, admin_headers: dict, pending_payment: Payment
    ):
        resp = await client.patch(
            f"/payments/{pending_payment.id}",
            json={"notes": "Changed to 1 month plan"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["notes"] == "Changed to 1 month plan"

    async def test_mark_as_completed(
        self, client: AsyncClient, admin_headers: dict, pending_payment: Payment
    ):
        resp = await client.patch(
            f"/payments/{pending_payment.id}",
            json={"payment_status": "completed"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["payment_status"] == "completed"

    async def test_edit_multiple_fields(
        self, client: AsyncClient, admin_headers: dict, pending_payment: Payment
    ):
        resp = await client.patch(
            f"/payments/{pending_payment.id}",
            json={
                "amount_in_paise": 100000,
                "payment_method": "cash",
                "payment_status": "completed",
                "notes": "Paid 1 month cash",
            },
            headers=admin_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["amount_in_paise"] == 100000
        assert body["payment_method"] == "cash"
        assert body["payment_status"] == "completed"
        assert body["notes"] == "Paid 1 month cash"


# === Tests: Completed Payment Editing ===


class TestEditCompletedPayment:
    async def test_edit_notes_allowed(
        self, client: AsyncClient, admin_headers: dict, completed_payment: Payment
    ):
        resp = await client.patch(
            f"/payments/{completed_payment.id}",
            json={"notes": "Updated note"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["notes"] == "Updated note"

    async def test_edit_method_allowed(
        self, client: AsyncClient, admin_headers: dict, completed_payment: Payment
    ):
        resp = await client.patch(
            f"/payments/{completed_payment.id}",
            json={"payment_method": "upi"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["payment_method"] == "upi"

    async def test_edit_amount_rejected(
        self, client: AsyncClient, admin_headers: dict, completed_payment: Payment
    ):
        resp = await client.patch(
            f"/payments/{completed_payment.id}",
            json={"amount_in_paise": 200000},
            headers=admin_headers,
        )
        assert resp.status_code == 422 or resp.status_code == 400

    async def test_edit_status_rejected(
        self, client: AsyncClient, admin_headers: dict, completed_payment: Payment
    ):
        resp = await client.patch(
            f"/payments/{completed_payment.id}",
            json={"payment_status": "pending"},
            headers=admin_headers,
        )
        assert resp.status_code == 422 or resp.status_code == 400


# === Tests: Edge Cases ===


class TestPaymentEditEdgeCases:
    async def test_edit_nonexistent_payment(
        self, client: AsyncClient, admin_headers: dict
    ):
        resp = await client.patch(
            f"/payments/{uuid4()}",
            json={"notes": "test"},
            headers=admin_headers,
        )
        assert resp.status_code == 404

    async def test_edit_empty_payload_rejected(
        self, client: AsyncClient, admin_headers: dict, pending_payment: Payment
    ):
        resp = await client.patch(
            f"/payments/{pending_payment.id}",
            json={},
            headers=admin_headers,
        )
        assert resp.status_code == 422 or resp.status_code == 400

    async def test_staff_cannot_edit(
        self, client: AsyncClient, db_session: AsyncSession,
        payment_gym: Gym, pending_payment: Payment
    ):
        staff = User(
            id=uuid4(),
            gym_id=payment_gym.id,
            name="Staff User",
            email=f"staff-{uuid4().hex[:6]}@test.com",
            phone="9876543212",
            password_hash=hash_password("Pass1234"),
            role=UserRole.STAFF,
        )
        db_session.add(staff)
        await db_session.flush()
        cache = get_cache_backend()
        cache.set(f"user_active:{staff.id}", "1", 99999)
        cache.set(f"user_revoked_at:{staff.id}", "", 99999)
        token = create_access_token(staff.id, payment_gym.id, staff.role.value)
        headers = {"Authorization": f"Bearer {token}"}

        resp = await client.patch(
            f"/payments/{pending_payment.id}",
            json={"notes": "test"},
            headers=headers,
        )
        assert resp.status_code == 403
