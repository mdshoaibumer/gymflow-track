# ruff: noqa: E402, F401
"""
Run due management tests against SQLite (no PostgreSQL required).

Usage:
    cd backend
    python dev-scripts/backend-scratch/test_dues_sqlite.py
"""

import json
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

# ── Environment setup (BEFORE any app imports) ─────────────────────────
os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["DATABASE_URL_SYNC"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-manual-testing-only-32chars!"
os.environ["RAZORPAY_KEY_ID"] = "mock"
os.environ["RATE_LIMIT_AUTH"] = "1000"
os.environ["RATE_LIMIT_API"] = "10000"
os.environ["REDIS_URL"] = ""
os.environ["SUBSCRIPTION_ENFORCE"] = "false"

# Suppress noisy SQLAlchemy echo logging
import logging
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("gymflow").setLevel(logging.WARNING)

# ── Monkey-patch PostgreSQL types for SQLite ───────────────────────────
import sqlalchemy
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB as PG_JSONB


@compiles(PG_UUID, "sqlite")
def _compile_pg_uuid_sqlite(type_, compiler, **kw):
    return "VARCHAR(36)"


@compiles(PG_JSONB, "sqlite")
def _compile_pg_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


_orig_uuid_bind = PG_UUID.bind_processor
_orig_uuid_result = PG_UUID.result_processor


def _patched_uuid_bind(self, dialect):
    if dialect.name == "sqlite":
        def process(value):
            return str(value) if value is not None else value
        return process
    if _orig_uuid_bind:
        return _orig_uuid_bind(self, dialect)
    return None


def _patched_uuid_result(self, dialect, coltype):
    if dialect.name == "sqlite":
        def process(value):
            if value is not None and isinstance(value, str):
                import uuid as _uuid
                return _uuid.UUID(value)
            return value
        return process
    if _orig_uuid_result:
        return _orig_uuid_result(self, dialect, coltype)
    return None


PG_UUID.bind_processor = _patched_uuid_bind
PG_UUID.result_processor = _patched_uuid_result


_orig_jsonb_bind = PG_JSONB.bind_processor
_orig_jsonb_result = PG_JSONB.result_processor


def _patched_jsonb_bind(self, dialect):
    if dialect.name == "sqlite":
        def process(value):
            return json.dumps(value) if value is not None else value
        return process
    if _orig_jsonb_bind:
        return _orig_jsonb_bind(self, dialect)
    return None


def _patched_jsonb_result(self, dialect, coltype):
    if dialect.name == "sqlite":
        def process(value):
            if value is not None and isinstance(value, str):
                return json.loads(value)
            return value
        return process
    if _orig_jsonb_result:
        return _orig_jsonb_result(self, dialect, coltype)
    return None


PG_JSONB.bind_processor = _patched_jsonb_bind
PG_JSONB.result_processor = _patched_jsonb_result

_orig_enum_init = sqlalchemy.Enum.__init__


def _patched_enum_init(self, *args, **kwargs):
    kwargs["native_enum"] = False
    _orig_enum_init(self, *args, **kwargs)


sqlalchemy.Enum.__init__ = _patched_enum_init

# Patch create_async_engine for SQLite
from sqlalchemy.ext.asyncio import create_async_engine as _orig_create_async_engine
from sqlalchemy.pool import StaticPool
import sqlalchemy.ext.asyncio as _sa_async
import sqlalchemy.ext.asyncio.engine as _sa_engine_mod

_POOL_ARGS = {"pool_size", "max_overflow", "pool_timeout", "pool_pre_ping", "pool_recycle"}


def _patched_create_async_engine(url, **kw):
    url_str = str(url)
    if "sqlite" in url_str:
        kw = {k: v for k, v in kw.items() if k not in _POOL_ARGS}
        kw["poolclass"] = StaticPool
        kw.setdefault("connect_args", {})["check_same_thread"] = False
    return _orig_create_async_engine(url, **kw)


_sa_async.create_async_engine = _patched_create_async_engine
_sa_engine_mod.create_async_engine = _patched_create_async_engine

# Reload database module
import importlib
import app.core.database
importlib.reload(app.core.database)

# ── Now run the actual tests ───────────────────────────────────────────
import asyncio
from uuid import uuid4
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import async_sessionmaker
from httpx import ASGITransport, AsyncClient

from app.core.database import engine
from app.models.base import Base
from app.main import app
from app.core.database import get_db
from app.core.security import create_access_token, hash_password
from app.core.cache import get_cache_backend
from app.models.gym import Gym
from app.models.user import User, UserRole
from app.models.member import Member, MembershipStatus
from app.models.membership_plan import GymMembershipPlan
from app.models.payment import Payment
from app.models.due import MemberDue, DuePayment
from app.models.subscription import SubscriptionPlan, GymSubscription, BillingStatus, PlanTier

# Import all models for create_all
from app.models.notification import Notification  # noqa
from app.models.attendance import Attendance  # noqa
from app.models.asset import Asset, MaintenanceRecord  # noqa
from app.models.member_invoice import MemberInvoice  # noqa


TestSession = async_sessionmaker(engine, expire_on_commit=False)

PASS = 0
FAIL = 0


def ok(name):
    global PASS
    PASS += 1
    print(f"  ✓ {name}")


def fail(name, msg):
    global FAIL
    FAIL += 1
    print(f"  ✗ {name}: {msg}")


async def run_tests():
    global PASS, FAIL

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed subscription plans
    async with TestSession() as session:
        async with session.begin():
            from app.services.billing_service import seed_default_plans
            await seed_default_plans(session)

    async with TestSession() as session:
        async with session.begin():
            # Get elite plan
            from sqlalchemy import select
            plan = (await session.execute(
                select(SubscriptionPlan).where(SubscriptionPlan.tier == PlanTier.ELITE)
            )).scalar_one()

            # Create gym
            gym = Gym(id=uuid4(), name="Test Gym", slug=f"test-{uuid4().hex[:8]}",
                      phone="9876543210", email="t@g.com")
            session.add(gym)
            await session.flush()

            # Create subscription
            sub = GymSubscription(id=uuid4(), gym_id=gym.id, plan_id=plan.id, status=BillingStatus.ACTIVE)
            session.add(sub)
            await session.flush()

            cache = get_cache_backend()
            cache.set(f"sub:{gym.id}", "full", 99999)

            # Create owner
            owner = User(id=uuid4(), gym_id=gym.id, name="Owner", email="o@g.com",
                         phone="9876543210", password_hash=hash_password("Pass123"),
                         role=UserRole.OWNER)
            session.add(owner)
            await session.flush()
            cache.set(f"user_active:{owner.id}", "1", 99999)
            cache.set(f"user_revoked_at:{owner.id}", "", 99999)

            # Create membership plan: Quarterly ₹3,000
            qplan = GymMembershipPlan(id=uuid4(), gym_id=gym.id, name="Quarterly",
                                       duration_months=3, amount=3000, is_active=True)
            session.add(qplan)
            await session.flush()

            # Create member
            member = Member(id=uuid4(), gym_id=gym.id, name="Test Member",
                           phone="9876500200", membership_status=MembershipStatus.ACTIVE,
                           membership_start=date.today(), membership_end=date.today() + timedelta(days=90),
                           membership_plan="Quarterly", amount_paid=0)
            session.add(member)
            await session.flush()

            token = create_access_token(owner.id, gym.id, owner.role.value)
            headers = {"Authorization": f"Bearer {token}"}

    # Override DB dependency (mirrors real get_db: commit on success, rollback on error)
    async def _override_get_db():
        async with TestSession() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        member_id = str(member.id)

        # ═══════════════════════════════════════════════════════════════
        print("\n═══ TEST 1: Full payment → no due ═══")
        # ═══════════════════════════════════════════════════════════════
        # Create a fresh member for this test
        async with TestSession() as s:
            async with s.begin():
                m1 = Member(id=uuid4(), gym_id=gym.id, name="Full Payer",
                           phone="9876500301", membership_status=MembershipStatus.ACTIVE,
                           amount_paid=0)
                s.add(m1)
                await s.flush()

        resp = await client.post("/api/v1/payments", json={
            "member_id": str(m1.id), "amount_in_paise": 300000,
            "payment_method": "cash", "membership_plan": "Quarterly",
            "membership_end": str(date.today() + timedelta(days=90)),
        }, headers=headers)
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"

        dues_resp = await client.get(f"/api/v1/dues/member/{m1.id}", headers=headers)
        assert dues_resp.status_code == 200
        if len(dues_resp.json()) == 0:
            ok("Full payment (₹3,000) → no due created")
        else:
            fail("Full payment → no due", f"Expected 0 dues, got {len(dues_resp.json())}")

        # ═══════════════════════════════════════════════════════════════
        print("\n═══ TEST 2: Negotiated full payment (₹200 discount, ₹2,800 paid) → no due ═══")
        # ═══════════════════════════════════════════════════════════════
        async with TestSession() as s:
            async with s.begin():
                m2 = Member(id=uuid4(), gym_id=gym.id, name="Negotiator",
                           phone="9876500302", membership_status=MembershipStatus.ACTIVE,
                           amount_paid=0)
                s.add(m2)

        resp = await client.post("/api/v1/payments", json={
            "member_id": str(m2.id), "amount_in_paise": 280000,
            "discount_in_paise": 20000, "payment_method": "cash",
            "membership_plan": "Quarterly",
            "membership_end": str(date.today() + timedelta(days=90)),
        }, headers=headers)
        assert resp.status_code == 201

        dues_resp = await client.get(f"/api/v1/dues/member/{m2.id}", headers=headers)
        if len(dues_resp.json()) == 0:
            ok("Negotiated full payment (₹2,800 with ₹200 discount) → no due")
        else:
            fail("Negotiated full payment", f"Got {len(dues_resp.json())} dues")

        # ═══════════════════════════════════════════════════════════════
        print("\n═══ TEST 3: Partial payment → due created ═══")
        # ═══════════════════════════════════════════════════════════════
        async with TestSession() as s:
            async with s.begin():
                m3 = Member(id=uuid4(), gym_id=gym.id, name="Partial Payer",
                           phone="9876500303", membership_status=MembershipStatus.ACTIVE,
                           amount_paid=0)
                s.add(m3)

        resp = await client.post("/api/v1/payments", json={
            "member_id": str(m3.id), "amount_in_paise": 200000,
            "payment_method": "cash", "membership_plan": "Quarterly",
            "membership_end": str(date.today() + timedelta(days=90)),
        }, headers=headers)
        assert resp.status_code == 201

        dues_resp = await client.get(f"/api/v1/dues/member/{m3.id}", headers=headers)
        dues = dues_resp.json()
        if len(dues) == 1 and dues[0]["balance_paise"] == 100000:
            ok("Partial payment (₹2,000 of ₹3,000) → due with ₹1,000 balance")
        else:
            fail("Partial payment", f"Dues: {dues}")

        # ═══════════════════════════════════════════════════════════════
        print("\n═══ TEST 4: Discount + partial → correct due amount ═══")
        print("    ₹3,000 plan, ₹200 discount, ₹1,000 paid → ₹1,800 balance")
        # ═══════════════════════════════════════════════════════════════
        async with TestSession() as s:
            async with s.begin():
                m4 = Member(id=uuid4(), gym_id=gym.id, name="Discount Partial",
                           phone="9876500304", membership_status=MembershipStatus.ACTIVE,
                           amount_paid=0)
                s.add(m4)

        resp = await client.post("/api/v1/payments", json={
            "member_id": str(m4.id), "amount_in_paise": 100000,
            "discount_in_paise": 20000, "payment_method": "cash",
            "membership_plan": "Quarterly",
            "membership_end": str(date.today() + timedelta(days=90)),
        }, headers=headers)
        assert resp.status_code == 201

        dues_resp = await client.get(f"/api/v1/dues/member/{m4.id}", headers=headers)
        dues = dues_resp.json()
        d = dues[0] if dues else {}
        if (len(dues) == 1
            and d.get("plan_amount_paise") == 300000
            and d.get("discount_paise") == 20000
            and d.get("effective_amount_paise") == 280000
            and d.get("total_paid_paise") == 100000
            and d.get("balance_paise") == 180000):
            ok("Discount+partial: ₹3,000 - ₹200 discount = ₹2,800 effective, ₹1,000 paid, ₹1,800 balance")
        else:
            fail("Discount+partial", f"Due: {d}")

        due_id = d["id"]

        # ═══════════════════════════════════════════════════════════════
        print("\n═══ TEST 5: Three-step settlement (₹1,000 → ₹1,000 → ₹800) ═══")
        # ═══════════════════════════════════════════════════════════════
        # Already paid ₹1,000 above. Pay ₹1,000 more.
        resp2 = await client.post(f"/api/v1/dues/{due_id}/pay", json={
            "amount_in_paise": 100000, "payment_method": "upi",
        }, headers=headers)
        if resp2.status_code == 201:
            d2 = resp2.json()
            if d2["balance_paise"] == 80000 and d2["status"] == "partial":
                ok("Step 2: Paid ₹1,000 → balance ₹800, status=partial")
            else:
                fail("Step 2", f"balance={d2.get('balance_paise')}, status={d2.get('status')}")
        else:
            fail("Step 2", f"HTTP {resp2.status_code}: {resp2.text}")

        # Pay remaining ₹800
        resp3 = await client.post(f"/api/v1/dues/{due_id}/pay", json={
            "amount_in_paise": 80000, "payment_method": "cash",
        }, headers=headers)
        if resp3.status_code == 201:
            d3 = resp3.json()
            if d3["balance_paise"] == 0 and d3["status"] == "paid":
                ok("Step 3: Paid ₹800 → balance ₹0, status=paid ✓ FULLY SETTLED")
            else:
                fail("Step 3", f"balance={d3.get('balance_paise')}, status={d3.get('status')}")
        else:
            fail("Step 3", f"HTTP {resp3.status_code}: {resp3.text}")

        # ═══════════════════════════════════════════════════════════════
        print("\n═══ TEST 6: Overpayment rejected ═══")
        # ═══════════════════════════════════════════════════════════════
        # Create another due for overpayment test
        async with TestSession() as s:
            async with s.begin():
                m5 = Member(id=uuid4(), gym_id=gym.id, name="Overpayer",
                           phone="9876500305", membership_status=MembershipStatus.ACTIVE,
                           amount_paid=0)
                s.add(m5)

        await client.post("/api/v1/payments", json={
            "member_id": str(m5.id), "amount_in_paise": 200000,
            "payment_method": "cash", "membership_plan": "Quarterly",
            "membership_end": str(date.today() + timedelta(days=90)),
        }, headers=headers)
        dr = await client.get(f"/api/v1/dues/member/{m5.id}", headers=headers)
        overpay_due_id = dr.json()[0]["id"]

        resp_over = await client.post(f"/api/v1/dues/{overpay_due_id}/pay", json={
            "amount_in_paise": 200000, "payment_method": "cash",
        }, headers=headers)
        if resp_over.status_code in (400, 422):
            ok("Overpayment (₹2,000 > ₹1,000 balance) rejected")
        else:
            fail("Overpayment", f"Expected 400/422, got {resp_over.status_code}")

        # ═══════════════════════════════════════════════════════════════
        print("\n═══ TEST 7: Payment on settled due rejected ═══")
        # ═══════════════════════════════════════════════════════════════
        resp_settled = await client.post(f"/api/v1/dues/{due_id}/pay", json={
            "amount_in_paise": 10000, "payment_method": "cash",
        }, headers=headers)
        if resp_settled.status_code in (400, 422):
            ok("Payment on paid due rejected")
        else:
            fail("Settled due payment", f"Expected 400/422, got {resp_settled.status_code}")

        # ═══════════════════════════════════════════════════════════════
        print("\n═══ TEST 8: Due detail shows all linked payments ═══")
        # ═══════════════════════════════════════════════════════════════
        detail = await client.get(f"/api/v1/dues/{due_id}", headers=headers)
        if detail.status_code == 200:
            payments = detail.json().get("payments", [])
            if len(payments) == 3:
                ok(f"Due detail shows 3 linked payments (₹1,000 + ₹1,000 + ₹800)")
            else:
                fail("Due detail", f"Expected 3 payments, got {len(payments)}")
        else:
            fail("Due detail", f"HTTP {detail.status_code}")

        # ═══════════════════════════════════════════════════════════════
        print("\n═══ TEST 9: Summary endpoint ═══")
        # ═══════════════════════════════════════════════════════════════
        summary = await client.get("/api/v1/dues/summary", headers=headers)
        if summary.status_code == 200:
            s = summary.json()
            if "total_members_with_dues" in s and "total_outstanding_paise" in s:
                ok(f"Summary: {s['total_members_with_dues']} members, ₹{s['total_outstanding_paise']/100:.0f} outstanding")
            else:
                fail("Summary", f"Missing fields: {s}")
        else:
            fail("Summary", f"HTTP {summary.status_code}")

        # ═══════════════════════════════════════════════════════════════
        print("\n═══ TEST 10: Aging report ═══")
        # ═══════════════════════════════════════════════════════════════
        aging = await client.get("/api/v1/dues/aging-report", headers=headers)
        if aging.status_code == 200:
            a = aging.json()
            ranges = [b["range"] for b in a.get("buckets", [])]
            if "not_yet_due" in ranges and "0-30" in ranges:
                ok(f"Aging report: {len(a['buckets'])} buckets, ₹{a['total_outstanding_paise']/100:.0f} total")
            else:
                fail("Aging report", f"Missing buckets: {ranges}")
        else:
            fail("Aging report", f"HTTP {aging.status_code}")

        # ═══════════════════════════════════════════════════════════════
        print("\n═══ TEST 11: Waive a due ═══")
        # ═══════════════════════════════════════════════════════════════
        # Use the overpay member's due (still has ₹1,000 balance)
        waive_resp = await client.post(f"/api/v1/dues/{overpay_due_id}/waive", json={
            "reason": "Loyal customer, waiving remaining balance",
        }, headers=headers)
        if waive_resp.status_code == 200:
            w = waive_resp.json()
            if w["status"] == "waived" and w["balance_paise"] == 0:
                ok("Due waived: status=waived, balance=₹0")
            else:
                fail("Waive", f"status={w.get('status')}, balance={w.get('balance_paise')}")
        else:
            fail("Waive", f"HTTP {waive_resp.status_code}: {waive_resp.text}")

    app.dependency_overrides.clear()

    # ═══════════════════════════════════════════════════════════════
    print(f"\n{'='*50}")
    print(f"  Results: {PASS} passed, {FAIL} failed")
    print(f"{'='*50}")
    return FAIL == 0


if __name__ == "__main__":
    success = asyncio.run(run_tests())
    sys.exit(0 if success else 1)
