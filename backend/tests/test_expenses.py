"""
Comprehensive tests for the Expense Management module.

Covers:
- Category CRUD (create, list, update, deactivate)
- Category custom fields (add, update)
- Expense CRUD (create, list, update, delete)
- Dashboard analytics
- Tenant isolation (cross-gym access prevention)
- RBAC enforcement (staff can view, only admin+ can create, only owner can delete)
- Validation (required custom fields, recurring day, amount)
- Edge cases (empty data, budget alerts, monthly trend)
"""

from datetime import date
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_backend
from app.core.security import create_access_token, hash_password
from app.models.gym import Gym
from app.models.user import User, UserRole


# === Fixtures ===


@pytest.fixture
async def expense_category(client: AsyncClient, auth_headers: dict) -> dict:
    """Create a basic expense category for reuse in tests."""
    response = await client.post(
        "/api/v1/expenses/categories",
        json={
            "name": "Rent",
            "icon": "home",
            "color": "#FF5733",
            "is_recurring": True,
            "recurring_day": 5,
            "budget_limit_paise": 7000000,
            "sort_order": 1,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture
async def expense_category_with_fields(client: AsyncClient, auth_headers: dict) -> dict:
    """Create a category with inline custom fields."""
    response = await client.post(
        "/api/v1/expenses/categories",
        json={
            "name": "Electricity",
            "icon": "zap",
            "color": "#FFC300",
            "is_recurring": True,
            "recurring_day": 10,
            "fields": [
                {"label": "Meter Reading", "field_type": "number", "is_required": True, "sort_order": 1},
                {"label": "Units Consumed", "field_type": "number", "is_required": False, "sort_order": 2},
                {"label": "Bill Number", "field_type": "text", "is_required": True, "sort_order": 3},
                {
                    "label": "Payment Mode",
                    "field_type": "dropdown",
                    "options": ["UPI", "Cash", "Bank Transfer"],
                    "is_required": False,
                    "sort_order": 4,
                },
            ],
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture
async def sample_expense(
    client: AsyncClient, auth_headers: dict, expense_category: dict
) -> dict:
    """Create a sample expense record."""
    response = await client.post(
        "/api/v1/expenses",
        json={
            "category_id": expense_category["id"],
            "amount_in_paise": 6500000,
            "expense_date": str(date.today()),
            "description": "Monthly rent payment",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture
async def staff_user(db_session: AsyncSession, sample_gym: Gym) -> User:
    """Create a staff user (limited permissions)."""
    user = User(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Test Staff",
        email=f"staff-{uuid4().hex[:6]}@testgym.com",
        phone="9876000000",
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
    """Auth headers for a staff user."""
    token = create_access_token(staff_user.id, sample_gym.id, staff_user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def admin_user(db_session: AsyncSession, sample_gym: Gym) -> User:
    """Create an admin user."""
    user = User(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Test Admin",
        email=f"admin-{uuid4().hex[:6]}@testgym.com",
        phone="9876111111",
        password_hash=hash_password("TestPass123"),
        role=UserRole.ADMIN,
    )
    db_session.add(user)
    await db_session.flush()
    cache = get_cache_backend()
    cache.set(f"user_active:{user.id}", "1", 99999)
    cache.set(f"user_revoked_at:{user.id}", "", 99999)
    return user


@pytest.fixture
def admin_headers(admin_user: User, sample_gym: Gym) -> dict[str, str]:
    """Auth headers for an admin user."""
    token = create_access_token(admin_user.id, sample_gym.id, admin_user.role.value)
    return {"Authorization": f"Bearer {token}"}


# === Category Tests ===


class TestExpenseCategories:
    """Tests for expense category CRUD."""

    async def test_create_category_basic(self, client: AsyncClient, auth_headers: dict):
        """Owner can create a basic expense category."""
        response = await client.post(
            "/api/v1/expenses/categories",
            json={"name": "Maintenance", "color": "#00FF00"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Maintenance"
        assert data["color"] == "#00FF00"
        assert data["is_recurring"] is False
        assert data["is_active"] is True

    async def test_create_category_with_recurring(self, client: AsyncClient, auth_headers: dict):
        """Recurring category requires recurring_day."""
        response = await client.post(
            "/api/v1/expenses/categories",
            json={"name": "Salary", "is_recurring": True, "recurring_day": 1},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["is_recurring"] is True
        assert data["recurring_day"] == 1

    async def test_create_category_recurring_without_day_fails(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Recurring category without recurring_day returns validation error."""
        response = await client.post(
            "/api/v1/expenses/categories",
            json={"name": "Water Bill", "is_recurring": True},
            headers=auth_headers,
        )
        assert response.status_code == 422 or response.status_code == 400

    async def test_create_category_with_inline_fields(
        self, client: AsyncClient, auth_headers: dict, expense_category_with_fields: dict
    ):
        """Category with inline fields creates fields correctly."""
        data = expense_category_with_fields
        assert data["name"] == "Electricity"
        assert len(data["fields"]) == 4
        field_labels = [f["label"] for f in data["fields"]]
        assert "Meter Reading" in field_labels
        assert "Payment Mode" in field_labels
        # Check dropdown field has options
        payment_field = next(f for f in data["fields"] if f["label"] == "Payment Mode")
        assert payment_field["field_type"] == "dropdown"
        assert "UPI" in payment_field["options"]

    async def test_list_categories(
        self, client: AsyncClient, auth_headers: dict, expense_category: dict
    ):
        """List categories returns all active categories."""
        response = await client.get(
            "/api/v1/expenses/categories",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        names = [c["name"] for c in data["categories"]]
        assert "Rent" in names

    async def test_get_category_by_id(
        self, client: AsyncClient, auth_headers: dict, expense_category: dict
    ):
        """Get a specific category by ID."""
        response = await client.get(
            f"/api/v1/expenses/categories/{expense_category['id']}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Rent"

    async def test_update_category(
        self, client: AsyncClient, auth_headers: dict, expense_category: dict
    ):
        """Owner can update category details."""
        response = await client.patch(
            f"/api/v1/expenses/categories/{expense_category['id']}",
            json={"name": "Shop Rent", "budget_limit_paise": 8000000},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Shop Rent"
        assert data["budget_limit_paise"] == 8000000

    async def test_deactivate_category(
        self, client: AsyncClient, auth_headers: dict, expense_category: dict
    ):
        """Owner can deactivate a category."""
        response = await client.patch(
            f"/api/v1/expenses/categories/{expense_category['id']}",
            json={"is_active": False},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False

    async def test_staff_cannot_create_category(
        self, client: AsyncClient, staff_headers: dict
    ):
        """Staff users cannot create categories (OWNER only)."""
        response = await client.post(
            "/api/v1/expenses/categories",
            json={"name": "Test"},
            headers=staff_headers,
        )
        assert response.status_code == 403


# === Category Field Tests ===


class TestExpenseCategoryFields:
    """Tests for custom field management on categories."""

    async def test_add_field_to_category(
        self, client: AsyncClient, auth_headers: dict, expense_category: dict
    ):
        """Owner can add custom fields to a category."""
        response = await client.post(
            f"/api/v1/expenses/categories/{expense_category['id']}/fields",
            json={
                "label": "Landlord Name",
                "field_type": "text",
                "is_required": False,
                "sort_order": 1,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["label"] == "Landlord Name"
        assert data["field_key"] == "landlord_name"
        assert data["field_type"] == "text"

    async def test_add_dropdown_field(
        self, client: AsyncClient, auth_headers: dict, expense_category: dict
    ):
        """Can add a dropdown field with options."""
        response = await client.post(
            f"/api/v1/expenses/categories/{expense_category['id']}/fields",
            json={
                "label": "Payment Method",
                "field_type": "dropdown",
                "options": ["Cash", "UPI", "NEFT"],
                "is_required": True,
                "sort_order": 2,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["field_type"] == "dropdown"
        assert "Cash" in data["options"]
        assert data["is_required"] is True

    async def test_duplicate_field_key_gets_suffix(
        self, client: AsyncClient, auth_headers: dict, expense_category: dict
    ):
        """Adding fields with the same label generates unique keys."""
        # Add first field
        await client.post(
            f"/api/v1/expenses/categories/{expense_category['id']}/fields",
            json={"label": "Note", "field_type": "text"},
            headers=auth_headers,
        )
        # Add second field with same label
        response = await client.post(
            f"/api/v1/expenses/categories/{expense_category['id']}/fields",
            json={"label": "Note", "field_type": "text"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["field_key"] == "note_1"

    async def test_nonexistent_category_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Adding field to nonexistent category returns 404."""
        fake_id = str(uuid4())
        response = await client.post(
            f"/api/v1/expenses/categories/{fake_id}/fields",
            json={"label": "Test", "field_type": "text"},
            headers=auth_headers,
        )
        assert response.status_code == 404


# === Expense CRUD Tests ===


class TestExpenseCRUD:
    """Tests for expense record CRUD operations."""

    async def test_create_expense(
        self, client: AsyncClient, auth_headers: dict, expense_category: dict
    ):
        """Admin/owner can create an expense."""
        response = await client.post(
            "/api/v1/expenses",
            json={
                "category_id": expense_category["id"],
                "amount_in_paise": 5000000,
                "expense_date": str(date.today()),
                "description": "Test expense",
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["amount_in_paise"] == 5000000
        assert data["category_name"] == "Rent"
        assert data["description"] == "Test expense"

    async def test_create_expense_with_custom_data(
        self, client: AsyncClient, auth_headers: dict, expense_category_with_fields: dict
    ):
        """Expense with custom data stores JSONB correctly."""
        response = await client.post(
            "/api/v1/expenses",
            json={
                "category_id": expense_category_with_fields["id"],
                "amount_in_paise": 1250000,
                "expense_date": str(date.today()),
                "description": "June electricity",
                "custom_data": {
                    "meter_reading": 45230,
                    "units_consumed": 890,
                    "bill_number": "TSSPDCL-2026-06",
                    "payment_mode": "Bank Transfer",
                },
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["custom_data"]["meter_reading"] == 45230
        assert data["custom_data"]["bill_number"] == "TSSPDCL-2026-06"

    async def test_create_expense_missing_required_field_fails(
        self, client: AsyncClient, auth_headers: dict, expense_category_with_fields: dict
    ):
        """Creating expense without required custom field fails validation."""
        response = await client.post(
            "/api/v1/expenses",
            json={
                "category_id": expense_category_with_fields["id"],
                "amount_in_paise": 1000000,
                "expense_date": str(date.today()),
                "custom_data": {
                    "units_consumed": 500,
                    # Missing "meter_reading" and "bill_number" which are required
                },
            },
            headers=auth_headers,
        )
        assert response.status_code == 400 or response.status_code == 422

    async def test_create_expense_invalid_category_fails(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Creating expense with non-existent category returns 404."""
        response = await client.post(
            "/api/v1/expenses",
            json={
                "category_id": str(uuid4()),
                "amount_in_paise": 5000000,
                "expense_date": str(date.today()),
            },
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_list_expenses(
        self, client: AsyncClient, auth_headers: dict, sample_expense: dict
    ):
        """List expenses returns paginated results."""
        response = await client.get(
            "/api/v1/expenses",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert len(data["expenses"]) >= 1

    async def test_list_expenses_filter_by_category(
        self, client: AsyncClient, auth_headers: dict, sample_expense: dict, expense_category: dict
    ):
        """List expenses can filter by category_id."""
        response = await client.get(
            f"/api/v1/expenses?category_id={expense_category['id']}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        for expense in data["expenses"]:
            assert expense["category_id"] == expense_category["id"]

    async def test_list_expenses_filter_by_date_range(
        self, client: AsyncClient, auth_headers: dict, sample_expense: dict
    ):
        """List expenses can filter by date range."""
        today = str(date.today())
        response = await client.get(
            f"/api/v1/expenses?date_from={today}&date_to={today}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1

    async def test_get_expense_by_id(
        self, client: AsyncClient, auth_headers: dict, sample_expense: dict
    ):
        """Get a specific expense by ID."""
        response = await client.get(
            f"/api/v1/expenses/{sample_expense['id']}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["id"] == sample_expense["id"]

    async def test_update_expense(
        self, client: AsyncClient, auth_headers: dict, sample_expense: dict
    ):
        """Admin/owner can update an expense."""
        response = await client.patch(
            f"/api/v1/expenses/{sample_expense['id']}",
            json={
                "amount_in_paise": 7000000,
                "description": "Rent increased",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["amount_in_paise"] == 7000000
        assert data["description"] == "Rent increased"

    async def test_delete_expense(
        self, client: AsyncClient, auth_headers: dict, sample_expense: dict
    ):
        """Owner can delete an expense."""
        response = await client.delete(
            f"/api/v1/expenses/{sample_expense['id']}",
            headers=auth_headers,
        )
        assert response.status_code == 204

        # Verify it's gone
        response = await client.get(
            f"/api/v1/expenses/{sample_expense['id']}",
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_delete_nonexistent_expense_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Deleting non-existent expense returns 404."""
        response = await client.delete(
            f"/api/v1/expenses/{uuid4()}",
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_zero_amount_fails(
        self, client: AsyncClient, auth_headers: dict, expense_category: dict
    ):
        """Amount must be greater than 0."""
        response = await client.post(
            "/api/v1/expenses",
            json={
                "category_id": expense_category["id"],
                "amount_in_paise": 0,
                "expense_date": str(date.today()),
            },
            headers=auth_headers,
        )
        assert response.status_code == 422


# === RBAC Tests ===


class TestExpenseRBAC:
    """Tests for role-based access control on expense endpoints."""

    async def test_staff_can_list_expenses(
        self, client: AsyncClient, staff_headers: dict, sample_expense: dict
    ):
        """Staff can view (GET) expenses."""
        response = await client.get(
            "/api/v1/expenses",
            headers=staff_headers,
        )
        assert response.status_code == 200

    async def test_staff_can_view_dashboard(
        self, client: AsyncClient, staff_headers: dict
    ):
        """Staff can view expense dashboard."""
        response = await client.get(
            "/api/v1/expenses/dashboard",
            headers=staff_headers,
        )
        assert response.status_code == 200

    async def test_staff_cannot_create_expense(
        self, client: AsyncClient, staff_headers: dict, expense_category: dict
    ):
        """Staff cannot create expenses (ADMIN+ required)."""
        response = await client.post(
            "/api/v1/expenses",
            json={
                "category_id": expense_category["id"],
                "amount_in_paise": 1000000,
                "expense_date": str(date.today()),
            },
            headers=staff_headers,
        )
        assert response.status_code == 403

    async def test_admin_can_create_expense(
        self, client: AsyncClient, admin_headers: dict, expense_category: dict
    ):
        """Admin can create expenses."""
        response = await client.post(
            "/api/v1/expenses",
            json={
                "category_id": expense_category["id"],
                "amount_in_paise": 3000000,
                "expense_date": str(date.today()),
                "description": "Admin created expense",
            },
            headers=admin_headers,
        )
        assert response.status_code == 201

    async def test_admin_cannot_delete_expense(
        self, client: AsyncClient, admin_headers: dict, sample_expense: dict
    ):
        """Admin cannot delete expenses (OWNER only)."""
        response = await client.delete(
            f"/api/v1/expenses/{sample_expense['id']}",
            headers=admin_headers,
        )
        assert response.status_code == 403

    async def test_staff_cannot_delete_expense(
        self, client: AsyncClient, staff_headers: dict, sample_expense: dict
    ):
        """Staff cannot delete expenses."""
        response = await client.delete(
            f"/api/v1/expenses/{sample_expense['id']}",
            headers=staff_headers,
        )
        assert response.status_code == 403


# === Tenant Isolation Tests ===


class TestExpenseTenantIsolation:
    """Ensure expenses from one gym are not visible to another."""

    async def test_cannot_access_other_gym_expenses(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_expense: dict,
        other_user: User,
        other_gym: Gym,
    ):
        """User from gym B cannot see expenses from gym A."""
        other_token = create_access_token(
            other_user.id, other_gym.id, other_user.role.value
        )
        other_headers = {"Authorization": f"Bearer {other_token}"}

        # Try to access specific expense
        response = await client.get(
            f"/api/v1/expenses/{sample_expense['id']}",
            headers=other_headers,
        )
        assert response.status_code == 404

    async def test_cannot_access_other_gym_categories(
        self,
        client: AsyncClient,
        auth_headers: dict,
        expense_category: dict,
        other_user: User,
        other_gym: Gym,
    ):
        """User from gym B cannot see categories from gym A."""
        other_token = create_access_token(
            other_user.id, other_gym.id, other_user.role.value
        )
        other_headers = {"Authorization": f"Bearer {other_token}"}

        response = await client.get(
            f"/api/v1/expenses/categories/{expense_category['id']}",
            headers=other_headers,
        )
        assert response.status_code == 404


# === Dashboard Tests ===


class TestExpenseDashboard:
    """Tests for the expense dashboard analytics."""

    async def test_dashboard_returns_structure(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Dashboard returns all expected fields."""
        response = await client.get(
            "/api/v1/expenses/dashboard",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_this_month_paise" in data
        assert "total_last_month_paise" in data
        assert "category_count" in data
        assert "category_breakdown" in data
        assert "monthly_trend" in data
        assert "recurring_status" in data
        assert "budget_alerts" in data

    async def test_dashboard_with_expenses(
        self, client: AsyncClient, auth_headers: dict, sample_expense: dict
    ):
        """Dashboard totals include created expenses."""
        response = await client.get(
            "/api/v1/expenses/dashboard",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_this_month_paise"] >= sample_expense["amount_in_paise"]

    async def test_dashboard_category_breakdown(
        self,
        client: AsyncClient,
        auth_headers: dict,
        expense_category: dict,
        sample_expense: dict,
    ):
        """Dashboard shows category breakdown with percentages."""
        response = await client.get(
            "/api/v1/expenses/dashboard",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["category_breakdown"]) >= 1
        rent_breakdown = next(
            (b for b in data["category_breakdown"] if b["category_name"] == "Rent"),
            None,
        )
        assert rent_breakdown is not None
        assert rent_breakdown["total_paise"] >= 6500000
        assert rent_breakdown["percentage"] > 0

    async def test_dashboard_recurring_status(
        self,
        client: AsyncClient,
        auth_headers: dict,
        expense_category: dict,
        sample_expense: dict,
    ):
        """Dashboard shows recurring expense status."""
        response = await client.get(
            "/api/v1/expenses/dashboard",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        # Rent is recurring — should appear in recurring_status
        recurring = data["recurring_status"]
        rent_status = next(
            (r for r in recurring if r["category_name"] == "Rent"), None
        )
        assert rent_status is not None
        assert rent_status["recurring_day"] == 5
        assert rent_status["is_recorded_this_month"] is True

    async def test_dashboard_budget_alerts(
        self, client: AsyncClient, auth_headers: dict, expense_category: dict
    ):
        """Budget alert appears when spending exceeds limit."""
        # Rent budget is 70,000 (7000000 paise). Create expense exceeding it.
        await client.post(
            "/api/v1/expenses",
            json={
                "category_id": expense_category["id"],
                "amount_in_paise": 7500000,
                "expense_date": str(date.today()),
                "description": "Over-budget rent",
            },
            headers=auth_headers,
        )

        response = await client.get(
            "/api/v1/expenses/dashboard",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        # There should be a budget alert for Rent
        assert len(data["budget_alerts"]) >= 1
        alert_names = [a["category_name"] for a in data["budget_alerts"]]
        assert "Rent" in alert_names

    async def test_dashboard_empty_gym(
        self,
        client: AsyncClient,
        other_user: User,
        other_gym: Gym,
    ):
        """Dashboard for a gym with no expenses returns zeros."""
        token = create_access_token(
            other_user.id, other_gym.id, other_user.role.value
        )
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.get(
            "/api/v1/expenses/dashboard",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_this_month_paise"] == 0
        assert data["total_last_month_paise"] == 0
        assert data["category_count"] == 0
        assert data["category_breakdown"] == []
        assert data["monthly_trend"] == []
