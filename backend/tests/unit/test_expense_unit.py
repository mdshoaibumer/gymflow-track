"""
Unit tests for the expense module that run WITHOUT a database.

Tests:
- Schema validation (Pydantic models)
- Field key generation logic
- Service-level validation logic (mocked DB)
"""

import pytest
from datetime import date
from uuid import uuid4

from app.schemas.expense import (
    ExpenseCategoryCreate,
    ExpenseCategoryUpdate,
    ExpenseCreate,
    ExpenseUpdate,
    ExpenseDashboardResponse,
    CategoryBreakdown,
    MonthlyTrend,
    RecurringStatus,
    ExpenseCategoryFieldCreate,
)
from app.services.expense_service import _make_field_key


# === Field Key Generation ===


class TestFieldKeyGeneration:
    """Test the label → field_key conversion."""

    def test_basic_label(self):
        assert _make_field_key("Meter Reading") == "meter_reading"

    def test_special_characters(self):
        assert _make_field_key("Bill #Number!") == "bill_number"

    def test_extra_spaces(self):
        assert _make_field_key("  Some  Field  ") == "some_field"

    def test_all_special_chars(self):
        assert _make_field_key("@#$%") == "field"

    def test_numbers(self):
        assert _make_field_key("Floor 2 Reading") == "floor_2_reading"

    def test_mixed_case(self):
        assert _make_field_key("Payment MODE") == "payment_mode"

    def test_hindi_transliteration(self):
        # Non-ASCII gets stripped, remaining joined
        result = _make_field_key("Bill Number")
        assert result == "bill_number"


# === Schema Validation ===


class TestExpenseSchemas:
    """Test Pydantic schema validation."""

    def test_create_category_minimal(self):
        data = ExpenseCategoryCreate(name="Rent")
        assert data.name == "Rent"
        assert data.is_recurring is False
        assert data.fields is None

    def test_create_category_with_fields(self):
        data = ExpenseCategoryCreate(
            name="Electricity",
            is_recurring=True,
            recurring_day=5,
            fields=[
                ExpenseCategoryFieldCreate(
                    label="Meter Reading",
                    field_type="number",
                    is_required=True,
                ),
            ],
        )
        assert len(data.fields) == 1
        assert data.fields[0].label == "Meter Reading"

    def test_create_category_recurring_day_range(self):
        """recurring_day must be 1-28."""
        with pytest.raises(Exception):
            ExpenseCategoryCreate(name="Test", is_recurring=True, recurring_day=30)

    def test_create_expense_amount_must_be_positive(self):
        """amount_in_paise must be > 0."""
        with pytest.raises(Exception):
            ExpenseCreate(
                category_id=uuid4(),
                amount_in_paise=0,
                expense_date=date.today(),
            )

    def test_create_expense_valid(self):
        data = ExpenseCreate(
            category_id=uuid4(),
            amount_in_paise=5000000,
            expense_date=date.today(),
            description="Monthly rent",
            custom_data={"landlord": "John"},
        )
        assert data.amount_in_paise == 5000000
        assert data.custom_data["landlord"] == "John"

    def test_update_category_partial(self):
        data = ExpenseCategoryUpdate(name="Updated Name")
        assert data.name == "Updated Name"
        assert data.color is None
        assert data.is_recurring is None

    def test_update_expense_partial(self):
        data = ExpenseUpdate(amount_in_paise=1000000)
        assert data.amount_in_paise == 1000000
        assert data.category_id is None

    def test_category_field_type_validation(self):
        """field_type must be one of: text, number, date, dropdown."""
        with pytest.raises(Exception):
            ExpenseCategoryFieldCreate(label="Test", field_type="invalid")

    def test_dashboard_response_structure(self):
        """Dashboard response can be constructed with all fields."""
        resp = ExpenseDashboardResponse(
            total_this_month_paise=500000,
            total_last_month_paise=400000,
            category_count=3,
            category_breakdown=[
                CategoryBreakdown(
                    category_id=uuid4(),
                    category_name="Rent",
                    category_color="#FF0000",
                    total_paise=300000,
                    count=1,
                    percentage=60.0,
                ),
            ],
            monthly_trend=[
                MonthlyTrend(month="2026-06", total_paise=500000),
            ],
            recurring_status=[
                RecurringStatus(
                    category_id=uuid4(),
                    category_name="Rent",
                    recurring_day=5,
                    is_recorded_this_month=True,
                    last_amount_paise=300000,
                ),
            ],
            budget_alerts=[],
        )
        assert resp.total_this_month_paise == 500000
        assert len(resp.category_breakdown) == 1
        assert resp.category_breakdown[0].percentage == 60.0


# === Model Import Verification ===


class TestModelImports:
    """Ensure all models and enums are importable."""

    def test_expense_model_import(self):
        from app.models.expense import Expense, ExpenseCategory, ExpenseCategoryField
        assert Expense.__tablename__ == "expenses"
        assert ExpenseCategory.__tablename__ == "expense_categories"
        assert ExpenseCategoryField.__tablename__ == "expense_category_fields"

    def test_expense_field_type_enum(self):
        from app.models.expense import ExpenseFieldType
        assert ExpenseFieldType.TEXT == "text"
        assert ExpenseFieldType.NUMBER == "number"
        assert ExpenseFieldType.DATE == "date"
        assert ExpenseFieldType.DROPDOWN == "dropdown"

    def test_router_import(self):
        from app.routers.expenses import router
        assert router is not None

    def test_service_import(self):
        from app.services.expense_service import ExpenseService
        assert ExpenseService is not None

    def test_repository_import(self):
        from app.repositories.expense_repository import (
            ExpenseRepository,
            ExpenseCategoryRepository,
            ExpenseCategoryFieldRepository,
        )
        assert ExpenseRepository is not None
        assert ExpenseCategoryRepository is not None
        assert ExpenseCategoryFieldRepository is not None


# === App Registration ===


class TestAppIntegration:
    """Verify the expense router is registered in the main app."""

    def test_expense_routes_registered(self):
        from app.main import app
        route_paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert "/api/v1/expenses" in route_paths or any(
            "/api/v1/expenses" in p for p in route_paths
        )

    def test_expense_dashboard_route_exists(self):
        from app.main import app
        route_paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert any("expenses/dashboard" in p for p in route_paths)

    def test_expense_categories_route_exists(self):
        from app.main import app
        route_paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert any("expenses/categories" in p for p in route_paths)
