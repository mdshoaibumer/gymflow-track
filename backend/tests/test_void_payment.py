"""
Tests for Payment Void and Membership Override system.

Covers:
- Successful payment void
- Already refunded rejection
- amount_paid recalculation from ledger
- Audit log creation
- Membership override update
- Non-admin access rejection
"""

from datetime import date, timedelta
from uuid import uuid4

import pytest
import sqlalchemy as sa

from app.models.gym_audit_log import GymAuditLog, GymAuditAction
from app.models.member import Member, MembershipStatus
from app.models.payment import Payment, PaymentMethod, PaymentStatus


@pytest.fixture
async def sample_member(db_session, sample_gym):
    """Create a test member."""
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Test Member",
        phone="9876543299",
        membership_status=MembershipStatus.ACTIVE,
        membership_plan="Monthly",
        membership_start=date.today() - timedelta(days=15),
        membership_end=date.today() + timedelta(days=15),
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def sample_payment(db_session, sample_gym, sample_member, sample_user):
    """Create a completed payment."""
    payment = Payment(
        id=uuid4(),
        gym_id=sample_gym.id,
        member_id=sample_member.id,
        amount_in_paise=200000,  # ₹2000
        payment_method=PaymentMethod.UPI,
        payment_status=PaymentStatus.COMPLETED,
        payment_date=date.today(),
        created_by=sample_user.id,
    )
    db_session.add(payment)
    # Update member amount_paid
    sample_member.amount_paid = 200000
    await db_session.flush()
    return payment


@pytest.fixture
async def second_payment(db_session, sample_gym, sample_member, sample_user):
    """Create a second completed payment."""
    payment = Payment(
        id=uuid4(),
        gym_id=sample_gym.id,
        member_id=sample_member.id,
        amount_in_paise=100000,  # ₹1000
        payment_method=PaymentMethod.CASH,
        payment_status=PaymentStatus.COMPLETED,
        payment_date=date.today(),
        created_by=sample_user.id,
    )
    db_session.add(payment)
    # Update member amount_paid
    sample_member.amount_paid = 300000  # ₹2000 + ₹1000
    await db_session.flush()
    return payment


# ==== PAYMENT VOID TESTS ====


class TestVoidPayment:
    """Test suite for POST /api/v1/payments/{payment_id}/void"""

    @pytest.mark.asyncio
    async def test_void_payment_success(
        self, client, auth_headers, sample_payment, sample_member, db_session
    ):
        """Successfully void a completed payment."""
        response = await client.post(
            f"/api/v1/payments/{sample_payment.id}/void",
            json={"reason": "Member requested refund due to relocation"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["payment_status"] == "refunded"
        assert data["void_reason"] == "Member requested refund due to relocation"
        assert data["voided_at"] is not None
        assert data["voided_by"] is not None

    @pytest.mark.asyncio
    async def test_void_already_refunded_rejected(
        self, client, auth_headers, sample_payment, db_session
    ):
        """Cannot void an already refunded payment."""
        # First void
        response = await client.post(
            f"/api/v1/payments/{sample_payment.id}/void",
            json={"reason": "First void"},
            headers=auth_headers,
        )
        assert response.status_code == 200

        # Second void attempt should fail
        response = await client.post(
            f"/api/v1/payments/{sample_payment.id}/void",
            json={"reason": "Second void attempt"},
            headers=auth_headers,
        )
        assert response.status_code == 422
        assert "already been voided" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_void_failed_payment_rejected(
        self, client, auth_headers, sample_gym, sample_member, db_session
    ):
        """Cannot void a failed payment."""
        failed_payment = Payment(
            id=uuid4(),
            gym_id=sample_gym.id,
            member_id=sample_member.id,
            amount_in_paise=50000,
            payment_method=PaymentMethod.CARD,
            payment_status=PaymentStatus.FAILED,
            payment_date=date.today(),
        )
        db_session.add(failed_payment)
        await db_session.flush()

        response = await client.post(
            f"/api/v1/payments/{failed_payment.id}/void",
            json={"reason": "Trying to void failed"},
            headers=auth_headers,
        )
        assert response.status_code == 422
        assert "failed" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_void_recomputes_amount_paid(
        self, client, auth_headers, sample_payment, second_payment, sample_member, db_session
    ):
        """Voiding recalculates member.amount_paid from ledger."""
        # Member has ₹3000 (₹2000 + ₹1000)
        assert sample_member.amount_paid == 300000

        # Void the ₹2000 payment
        response = await client.post(
            f"/api/v1/payments/{sample_payment.id}/void",
            json={"reason": "Incorrect amount collected"},
            headers=auth_headers,
        )
        assert response.status_code == 200

        # Refresh member from DB
        await db_session.refresh(sample_member)
        # Should now be ₹1000 (only second_payment remains completed)
        assert sample_member.amount_paid == 100000

    @pytest.mark.asyncio
    async def test_void_creates_audit_log(
        self, client, auth_headers, sample_payment, sample_gym, db_session
    ):
        """Voiding a payment creates an audit log entry."""
        response = await client.post(
            f"/api/v1/payments/{sample_payment.id}/void",
            json={"reason": "Audit test void"},
            headers=auth_headers,
        )
        assert response.status_code == 200

        # Check audit log
        result = await db_session.execute(
            sa.select(GymAuditLog).where(
                GymAuditLog.gym_id == sample_gym.id,
                GymAuditLog.entity_type == "payment",
                GymAuditLog.entity_id == sample_payment.id,
                GymAuditLog.action == GymAuditAction.PAYMENT_VOIDED,
            )
        )
        audit = result.scalar_one_or_none()
        assert audit is not None
        assert audit.old_data["payment_status"] == "completed"
        assert audit.new_data["payment_status"] == "refunded"
        assert audit.new_data["void_reason"] == "Audit test void"

    @pytest.mark.asyncio
    async def test_void_requires_admin(
        self, client, staff_headers, sample_payment
    ):
        """Staff cannot void payments — admin/owner only."""
        response = await client.post(
            f"/api/v1/payments/{sample_payment.id}/void",
            json={"reason": "Staff trying to void"},
            headers=staff_headers,
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_void_requires_reason(
        self, client, auth_headers, sample_payment
    ):
        """Void reason is required and must be at least 5 characters."""
        response = await client.post(
            f"/api/v1/payments/{sample_payment.id}/void",
            json={"reason": "hi"},
            headers=auth_headers,
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_void_nonexistent_payment(
        self, client, auth_headers
    ):
        """Cannot void a payment that doesn't exist."""
        fake_id = uuid4()
        response = await client.post(
            f"/api/v1/payments/{fake_id}/void",
            json={"reason": "Void nonexistent payment"},
            headers=auth_headers,
        )
        assert response.status_code == 404


# ==== MEMBERSHIP OVERRIDE TESTS ====


class TestMembershipOverride:
    """Test suite for PATCH /api/v1/members/{member_id}/override"""

    @pytest.mark.asyncio
    async def test_override_membership_success(
        self, client, auth_headers, sample_member
    ):
        """Successfully override membership details."""
        new_end = (date.today() + timedelta(days=60)).isoformat()
        response = await client.patch(
            f"/api/v1/members/{sample_member.id}/override",
            json={
                "membership_plan": "Quarterly",
                "membership_end": new_end,
                "version": sample_member.version,
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["membership_plan"] == "Quarterly"
        assert data["membership_end"] == new_end
        assert data["membership_status"] == "active"

    @pytest.mark.asyncio
    async def test_override_sets_status_explicitly(
        self, client, auth_headers, sample_member
    ):
        """Can explicitly set membership status."""
        response = await client.patch(
            f"/api/v1/members/{sample_member.id}/override",
            json={
                "membership_status": "frozen",
                "version": sample_member.version,
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["membership_status"] == "frozen"

    @pytest.mark.asyncio
    async def test_override_auto_computes_status(
        self, client, auth_headers, sample_member
    ):
        """Status auto-computed when dates change but status not explicitly set."""
        past_end = (date.today() - timedelta(days=5)).isoformat()
        response = await client.patch(
            f"/api/v1/members/{sample_member.id}/override",
            json={
                "membership_end": past_end,
                "version": sample_member.version,
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["membership_status"] == "expired"

    @pytest.mark.asyncio
    async def test_override_invalid_date_range_rejected(
        self, client, auth_headers, sample_member
    ):
        """Rejects start date after end date."""
        response = await client.patch(
            f"/api/v1/members/{sample_member.id}/override",
            json={
                "membership_start": (date.today() + timedelta(days=30)).isoformat(),
                "membership_end": date.today().isoformat(),
                "version": sample_member.version,
            },
            headers=auth_headers,
        )
        assert response.status_code == 422
        assert "start date cannot be after end date" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_override_creates_audit_log(
        self, client, auth_headers, sample_member, sample_gym, db_session
    ):
        """Membership override creates an audit log entry."""
        response = await client.patch(
            f"/api/v1/members/{sample_member.id}/override",
            json={
                "membership_status": "cancelled",
                "version": sample_member.version,
            },
            headers=auth_headers,
        )
        assert response.status_code == 200

        result = await db_session.execute(
            sa.select(GymAuditLog).where(
                GymAuditLog.gym_id == sample_gym.id,
                GymAuditLog.entity_type == "member",
                GymAuditLog.entity_id == sample_member.id,
                GymAuditLog.action == GymAuditAction.MEMBERSHIP_OVERRIDE,
            )
        )
        audit = result.scalar_one_or_none()
        assert audit is not None
        assert audit.old_data["membership_status"] == "active"
        assert audit.new_data["membership_status"] == "cancelled"

    @pytest.mark.asyncio
    async def test_override_requires_admin(
        self, client, staff_headers, sample_member
    ):
        """Staff cannot override membership — admin/owner only."""
        response = await client.patch(
            f"/api/v1/members/{sample_member.id}/override",
            json={
                "membership_status": "frozen",
                "version": sample_member.version,
            },
            headers=staff_headers,
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_override_optimistic_locking(
        self, client, auth_headers, sample_member
    ):
        """Optimistic locking prevents stale overrides."""
        response = await client.patch(
            f"/api/v1/members/{sample_member.id}/override",
            json={
                "membership_status": "frozen",
                "version": sample_member.version + 999,  # wrong version
            },
            headers=auth_headers,
        )
        assert response.status_code == 409
