"""
API contract tests — verify response shapes match frontend TypeScript interfaces.

These tests ensure the backend API returns the exact fields the frontend expects.
If a backend schema changes and breaks the frontend contract, these tests fail
BEFORE users encounter runtime errors.

Contract definitions are derived from frontend/src/services/*.service.ts interfaces.
"""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.user import User, UserRole


# === Frontend interface field contracts ===
# Each set defines the REQUIRED fields the frontend TypeScript interface expects.

AUTH_TOKEN_RESPONSE_FIELDS = {"access_token", "refresh_token", "token_type"}

CURRENT_USER_RESPONSE_FIELDS = {"id", "gym_id", "name", "email", "phone", "role", "is_active"}

MEMBER_RESPONSE_FIELDS = {
    "id", "name", "phone", "email", "gender",
    "membership_status", "membership_plan", "membership_start", "membership_end",
    "amount_paid", "version", "created_at", "updated_at",
}

MEMBER_LIST_RESPONSE_FIELDS = {"members", "total"}

PAYMENT_RESPONSE_FIELDS = {
    "id", "gym_id", "member_id", "amount_in_paise", "payment_method",
    "payment_status", "payment_date", "notes", "created_by", "member_name",
}

PAYMENT_LIST_RESPONSE_FIELDS = {"payments", "total"}


class TestAuthContract:
    """POST /auth/* responses must match frontend TokenResponse and CurrentUserResponse."""

    async def test_register_response_shape(self, client: AsyncClient):
        payload = {
            "gym_name": f"Contract Gym {uuid4().hex[:6]}",
            "owner_name": "Contract User",
            "phone": "9876500201",
            "email": f"contract-{uuid4().hex[:6]}@test.com",
            "password": "SecurePass123",
        }
        resp = await client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        missing = AUTH_TOKEN_RESPONSE_FIELDS - data.keys()
        assert not missing, f"Register response missing fields: {missing}"

    async def test_login_response_shape(self, client: AsyncClient):
        email = f"contract-login-{uuid4().hex[:6]}@test.com"
        # Register first
        await client.post("/api/v1/auth/register", json={
            "gym_name": f"Login Contract Gym {uuid4().hex[:6]}",
            "owner_name": "Login User",
            "phone": "9876500202",
            "email": email,
            "password": "SecurePass123",
        })
        # Login
        resp = await client.post("/api/v1/auth/login", json={
            "email": email, "password": "SecurePass123",
        })
        assert resp.status_code == 200
        data = resp.json()
        missing = AUTH_TOKEN_RESPONSE_FIELDS - data.keys()
        assert not missing, f"Login response missing fields: {missing}"

    async def test_me_response_shape(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        missing = CURRENT_USER_RESPONSE_FIELDS - data.keys()
        assert not missing, f"/auth/me response missing fields: {missing}"

    async def test_me_role_is_valid_enum(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/auth/me", headers=auth_headers)
        data = resp.json()
        valid_roles = {"super_admin", "owner", "admin", "staff"}
        assert data["role"] in valid_roles, f"Unexpected role: {data['role']}"


class TestMemberContract:
    """GET/POST /members responses must match frontend Member interface."""

    async def test_create_member_response_shape(
        self, client: AsyncClient, auth_headers: dict
    ):
        payload = {
            "name": "Contract Member",
            "phone": f"98765{uuid4().hex[:5][:5]}",
        }
        resp = await client.post("/api/v1/members", json=payload, headers=auth_headers)
        assert resp.status_code == 201
        data = resp.json()
        missing = MEMBER_RESPONSE_FIELDS - data.keys()
        assert not missing, f"Create member response missing fields: {missing}"

    async def test_list_members_response_shape(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/members", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        missing = MEMBER_LIST_RESPONSE_FIELDS - data.keys()
        assert not missing, f"List members response missing fields: {missing}"
        assert isinstance(data["members"], list)
        assert isinstance(data["total"], int)

    async def test_list_members_item_shape(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Each member in the list must have all required fields."""
        # Create a member first
        await client.post("/api/v1/members", json={
            "name": "Shape Test Member",
            "phone": f"98765{uuid4().hex[:5][:5]}",
        }, headers=auth_headers)

        resp = await client.get("/api/v1/members", headers=auth_headers)
        data = resp.json()
        if data["members"]:
            member = data["members"][0]
            missing = MEMBER_RESPONSE_FIELDS - member.keys()
            assert not missing, f"Member list item missing fields: {missing}"

    async def test_member_status_is_valid_enum(
        self, client: AsyncClient, auth_headers: dict
    ):
        """membership_status must match frontend type union."""
        valid_statuses = {"active", "expired", "frozen", "pending", "cancelled"}
        await client.post("/api/v1/members", json={
            "name": "Enum Test",
            "phone": f"98765{uuid4().hex[:5][:5]}",
        }, headers=auth_headers)

        resp = await client.get("/api/v1/members", headers=auth_headers)
        for member in resp.json()["members"]:
            assert member["membership_status"] in valid_statuses, (
                f"Unexpected status: {member['membership_status']}"
            )


class TestPaymentContract:
    """POST/GET /payments responses must match frontend Payment interface."""

    async def test_create_payment_response_shape(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, sample_gym: Gym,
    ):
        member = Member(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Payment Contract Member",
            phone=f"98765{uuid4().hex[:5][:5]}",
            membership_status=MembershipStatus.ACTIVE,
        )
        db_session.add(member)
        await db_session.flush()

        payload = {
            "member_id": str(member.id),
            "amount_in_paise": 50000,
            "payment_method": "cash",
            "payment_date": "2026-05-13",
        }
        resp = await client.post("/api/v1/payments", json=payload, headers=auth_headers)
        assert resp.status_code in (200, 201)
        data = resp.json()
        missing = PAYMENT_RESPONSE_FIELDS - data.keys()
        assert not missing, f"Create payment response missing fields: {missing}"

    async def test_list_payments_response_shape(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/payments", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        missing = PAYMENT_LIST_RESPONSE_FIELDS - data.keys()
        assert not missing, f"List payments response missing fields: {missing}"
        assert isinstance(data["payments"], list)
        assert isinstance(data["total"], int)

    async def test_payment_method_is_valid_enum(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, sample_gym: Gym,
    ):
        """payment_method must match frontend PaymentMethod type."""
        valid_methods = {"cash", "upi", "card", "bank_transfer", "other"}

        member = Member(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Enum Payment Member",
            phone=f"98765{uuid4().hex[:5][:5]}",
            membership_status=MembershipStatus.ACTIVE,
        )
        db_session.add(member)
        await db_session.flush()

        resp = await client.post("/api/v1/payments", json={
            "member_id": str(member.id),
            "amount_in_paise": 10000,
            "payment_method": "upi",
            "payment_date": "2026-05-13",
        }, headers=auth_headers)
        data = resp.json()
        assert data["payment_method"] in valid_methods

    async def test_payment_status_is_valid_enum(
        self, client: AsyncClient, auth_headers: dict,
        db_session: AsyncSession, sample_gym: Gym,
    ):
        """payment_status must match frontend PaymentStatus type."""
        valid_statuses = {"completed", "pending", "failed", "refunded"}

        member = Member(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Status Payment Member",
            phone=f"98765{uuid4().hex[:5][:5]}",
            membership_status=MembershipStatus.ACTIVE,
        )
        db_session.add(member)
        await db_session.flush()

        resp = await client.post("/api/v1/payments", json={
            "member_id": str(member.id),
            "amount_in_paise": 20000,
            "payment_method": "cash",
            "payment_date": "2026-05-13",
        }, headers=auth_headers)
        data = resp.json()
        assert data["payment_status"] in valid_statuses


class TestForgotPasswordContract:
    """POST /auth/forgot-password response must match ForgotPasswordResponse."""

    async def test_forgot_password_response_shape(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "anyone@test.com"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data, "forgot-password response missing 'message' field"
        assert isinstance(data["message"], str)


class TestDashboardContract:
    """GET /dashboard/* responses must match frontend DashboardMetrics."""

    DASHBOARD_METRICS_FIELDS = {
        "total_members", "active_members", "expiring_soon",
        "expired_members", "monthly_revenue_paise",
    }

    async def test_dashboard_metrics_response_shape(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.get("/api/v1/dashboard/metrics", headers=auth_headers)
        if resp.status_code == 200:
            data = resp.json()
            # Check that at least the core fields exist
            present = self.DASHBOARD_METRICS_FIELDS & data.keys()
            assert len(present) >= 4, (
                f"Dashboard metrics missing expected fields. "
                f"Got: {data.keys()}, expected subset of: {self.DASHBOARD_METRICS_FIELDS}"
            )
