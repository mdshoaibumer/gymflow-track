import pytest
from uuid import uuid4
from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_backend
from app.core.security import create_access_token, hash_password
from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.models.member_invoice import MemberInvoice
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.subscription import SubscriptionPlan, GymSubscription, BillingStatus  # noqa: F401
from app.models.user import User, UserRole


# ── Fixtures ─────────────────────────────────────────────────

@pytest.fixture
async def invoice_gym(db_session: AsyncSession) -> Gym:
    gym = Gym(id=uuid4(), name="Invoice Test Gym", slug=f"inv-gym-{uuid4().hex[:6]}", phone="9777777777")
    db_session.add(gym)
    await db_session.flush()
    get_cache_backend().set(f"sub:{gym.id}", "full", 99999)
    return gym


@pytest.fixture
async def invoice_owner(db_session: AsyncSession, invoice_gym: Gym) -> User:
    user = User(
        id=uuid4(), gym_id=invoice_gym.id, name="Invoice Owner",
        email=f"inv-owner-{uuid4().hex[:6]}@test.com", phone="9777777777",
        password_hash=hash_password("TestPass123"), role=UserRole.OWNER,
    )
    db_session.add(user)
    await db_session.flush()
    cache = get_cache_backend()
    cache.set(f"user_active:{user.id}", "1", 99999)
    cache.set(f"user_revoked_at:{user.id}", "", 99999)
    return user


@pytest.fixture
def owner_headers(invoice_owner: User, invoice_gym: Gym) -> dict:
    token = create_access_token(invoice_owner.id, invoice_gym.id, invoice_owner.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def invoice_superadmin(db_session: AsyncSession) -> User:
    user = User(
        id=uuid4(), gym_id=None, name="Super Admin",
        email=f"superadmin-{uuid4().hex[:6]}@test.com", phone="9888888888",
        password_hash=hash_password("TestPass123"), role=UserRole.SUPER_ADMIN,
    )
    db_session.add(user)
    await db_session.flush()
    cache = get_cache_backend()
    cache.set(f"user_active:{user.id}", "1", 99999)
    cache.set(f"user_revoked_at:{user.id}", "", 99999)
    return user


@pytest.fixture
def superadmin_headers(invoice_superadmin: User) -> dict:
    token = create_access_token(invoice_superadmin.id, None, invoice_superadmin.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def invoice_member(db_session: AsyncSession, invoice_gym: Gym) -> Member:
    member = Member(
        id=uuid4(), gym_id=invoice_gym.id, name="Invoice Test Member",
        phone="9999999999", membership_status=MembershipStatus.ACTIVE,
        membership_start=date.today(), membership_end=date.today() + timedelta(days=30),
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def member_payment(db_session: AsyncSession, invoice_gym: Gym, invoice_member: Member, invoice_owner: User) -> Payment:
    payment = Payment(
        id=uuid4(), gym_id=invoice_gym.id, member_id=invoice_member.id,
        amount_in_paise=150000, payment_method=PaymentMethod.CASH,
        payment_status=PaymentStatus.COMPLETED, payment_date=date.today(),
        created_by=invoice_owner.id,
    )
    db_session.add(payment)
    await db_session.flush()
    return payment


@pytest.fixture
async def payment_invoice(db_session: AsyncSession, invoice_gym: Gym, member_payment: Payment, invoice_member: Member) -> MemberInvoice:
    invoice = MemberInvoice(
        id=uuid4(), gym_id=invoice_gym.id, payment_id=member_payment.id,
        member_id=invoice_member.id, invoice_number="INV-2026-0001",
        invoice_date=date.today(), gym_name=invoice_gym.name,
        member_name=invoice_member.name, member_phone=invoice_member.phone,
        amount_in_paise=member_payment.amount_in_paise,
        payment_method=member_payment.payment_method,
        payment_date=member_payment.payment_date,
    )
    db_session.add(invoice)
    await db_session.flush()
    return invoice


# ── Invoice Access Tests ─────────────────────────────────────

class TestSuperAdminInvoiceAccess:
    """Verify that Super Admins can access invoices while regular owners are constrained."""

    @pytest.mark.asyncio
    async def test_superadmin_can_retrieve_any_invoice(
        self, client: AsyncClient, superadmin_headers: dict, payment_invoice: MemberInvoice
    ):
        """A Super Admin should successfully fetch any gym's invoice details."""
        resp = await client.get(f"/api/v1/invoices/{payment_invoice.id}", headers=superadmin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(payment_invoice.id)
        assert data["invoice_number"] == payment_invoice.invoice_number

    @pytest.mark.asyncio
    async def test_superadmin_can_download_any_pdf(
        self, client: AsyncClient, superadmin_headers: dict, payment_invoice: MemberInvoice
    ):
        """A Super Admin should successfully download the PDF of any gym's invoice."""
        resp = await client.get(f"/api/v1/invoices/{payment_invoice.id}/pdf", headers=superadmin_headers)
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "application/pdf"

    @pytest.mark.asyncio
    async def test_owner_can_retrieve_own_invoice(
        self, client: AsyncClient, owner_headers: dict, payment_invoice: MemberInvoice
    ):
        """A regular gym owner should successfully fetch their own gym's invoice."""
        resp = await client.get(f"/api/v1/invoices/{payment_invoice.id}", headers=owner_headers)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_owner_cannot_retrieve_other_gym_invoice(
        self, client: AsyncClient, db_session: AsyncSession, owner_headers: dict
    ):
        """A regular gym owner should get a 404 when trying to fetch an invoice of another gym."""
        # Create another gym, member, and payment
        other_gym = Gym(id=uuid4(), name="Other Gym", slug=f"other-{uuid4().hex[:6]}", phone="9990001112")
        db_session.add(other_gym)
        await db_session.flush()
        
        other_member = Member(
            id=uuid4(), gym_id=other_gym.id, name="Other Member",
            phone="9990001111", membership_status=MembershipStatus.ACTIVE,
            membership_start=date.today(), membership_end=date.today() + timedelta(days=30),
        )
        db_session.add(other_member)
        await db_session.flush()

        other_payment = Payment(
            id=uuid4(), gym_id=other_gym.id, member_id=other_member.id,
            amount_in_paise=10000, payment_method=PaymentMethod.CASH,
            payment_status=PaymentStatus.COMPLETED, payment_date=date.today(),
        )
        db_session.add(other_payment)
        await db_session.flush()

        other_invoice = MemberInvoice(
            id=uuid4(), gym_id=other_gym.id, payment_id=other_payment.id,
            member_id=other_member.id, invoice_number="INV-2026-9999",
            invoice_date=date.today(), gym_name=other_gym.name,
            member_name=other_member.name, member_phone=other_member.phone,
            amount_in_paise=other_payment.amount_in_paise,
            payment_method=other_payment.payment_method,
            payment_date=other_payment.payment_date,
        )
        db_session.add(other_invoice)
        await db_session.flush()

        resp = await client.get(f"/api/v1/invoices/{other_invoice.id}", headers=owner_headers)
        assert resp.status_code == 404
