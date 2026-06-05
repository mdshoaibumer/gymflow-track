"""
Expense management service — business logic for categories, fields, and expenses.

Responsibilities:
- CRUD for expense categories with custom fields
- CRUD for expense records with JSONB custom data
- Dashboard analytics (category breakdown, monthly trend, recurring status)
- Budget alert detection
"""

import re
import logging
from datetime import date
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.timezone import today_ist
from app.models.expense import Expense, ExpenseCategory, ExpenseCategoryField
from app.repositories.expense_repository import (
    ExpenseCategoryFieldRepository,
    ExpenseCategoryRepository,
    ExpenseRepository,
)
from app.schemas.expense import (
    CategoryBreakdown,
    ExpenseCategoryCreate,
    ExpenseCategoryFieldCreate,
    ExpenseCategoryUpdate,
    ExpenseDashboardResponse,
    ExpenseCreate,
    ExpenseUpdate,
    MonthlyTrend,
    RecurringStatus,
)

logger = logging.getLogger("gymflow.expenses")


def _make_field_key(label: str) -> str:
    """Convert a label like 'Meter Reading' → 'meter_reading'."""
    key = label.strip().lower()
    key = re.sub(r"[^a-z0-9]+", "_", key)
    key = key.strip("_")
    return key or "field"


class ExpenseService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.category_repo = ExpenseCategoryRepository(db)
        self.field_repo = ExpenseCategoryFieldRepository(db)
        self.expense_repo = ExpenseRepository(db)

    # === Category Operations ===

    async def create_category(
        self, gym_id: UUID, data: ExpenseCategoryCreate
    ) -> ExpenseCategory:
        """Create expense category with optional inline custom fields."""
        if data.is_recurring and not data.recurring_day:
            raise ValidationError("Recurring categories must specify a recurring_day (1-28)")

        category = ExpenseCategory(
            gym_id=gym_id,
            name=data.name.strip(),
            icon=data.icon,
            color=data.color,
            is_recurring=data.is_recurring,
            recurring_day=data.recurring_day if data.is_recurring else None,
            budget_limit_paise=data.budget_limit_paise,
            sort_order=data.sort_order,
        )
        category = await self.category_repo.create(category)

        # Create inline fields if provided
        if data.fields:
            existing_keys: set[str] = set()
            for field_data in data.fields:
                field_key = _make_field_key(field_data.label)
                original_key = field_key
                counter = 1
                while field_key in existing_keys:
                    field_key = f"{original_key}_{counter}"
                    counter += 1
                existing_keys.add(field_key)

                field = ExpenseCategoryField(
                    gym_id=gym_id,
                    category_id=category.id,
                    label=field_data.label.strip(),
                    field_key=field_key,
                    field_type=field_data.field_type,
                    options=field_data.options if field_data.field_type == "dropdown" else None,
                    is_required=field_data.is_required,
                    sort_order=field_data.sort_order,
                )
                await self.field_repo.create(field)

        await self.db.flush()
        # Reload with fields
        return await self.category_repo.get_by_id(category.id, gym_id)

    async def update_category(
        self, gym_id: UUID, category_id: UUID, data: ExpenseCategoryUpdate
    ) -> ExpenseCategory:
        """Update expense category."""
        category = await self.category_repo.get_by_id(category_id, gym_id)
        if not category:
            raise NotFoundError("Expense category not found")

        if data.name is not None:
            category.name = data.name.strip()
        if data.icon is not None:
            category.icon = data.icon
        if data.color is not None:
            category.color = data.color
        if data.is_recurring is not None:
            category.is_recurring = data.is_recurring
            if not data.is_recurring:
                category.recurring_day = None
        if data.recurring_day is not None:
            category.recurring_day = data.recurring_day
        if data.budget_limit_paise is not None:
            category.budget_limit_paise = data.budget_limit_paise
        if data.sort_order is not None:
            category.sort_order = data.sort_order
        if data.is_active is not None:
            category.is_active = data.is_active

        if category.is_recurring and not category.recurring_day:
            raise ValidationError("Recurring categories must specify a recurring_day (1-28)")

        await self.db.flush()
        return category

    async def list_categories(
        self, gym_id: UUID, active_only: bool = True
    ) -> list[ExpenseCategory]:
        return await self.category_repo.list_by_gym(gym_id, active_only)

    async def get_category(self, gym_id: UUID, category_id: UUID) -> ExpenseCategory:
        category = await self.category_repo.get_by_id(category_id, gym_id)
        if not category:
            raise NotFoundError("Expense category not found")
        return category

    # === Category Field Operations ===

    async def add_field_to_category(
        self, gym_id: UUID, category_id: UUID, data: ExpenseCategoryFieldCreate
    ) -> ExpenseCategoryField:
        """Add a custom field to an expense category."""
        category = await self.category_repo.get_by_id(category_id, gym_id)
        if not category:
            raise NotFoundError("Expense category not found")

        # Generate unique field key
        existing_fields = await self.field_repo.list_by_category(category_id, active_only=False)
        existing_keys = {f.field_key for f in existing_fields}

        field_key = _make_field_key(data.label)
        original_key = field_key
        counter = 1
        while field_key in existing_keys:
            field_key = f"{original_key}_{counter}"
            counter += 1

        field = ExpenseCategoryField(
            gym_id=gym_id,
            category_id=category_id,
            label=data.label.strip(),
            field_key=field_key,
            field_type=data.field_type,
            options=data.options if data.field_type == "dropdown" else None,
            is_required=data.is_required,
            sort_order=data.sort_order,
        )
        return await self.field_repo.create(field)

    async def update_category_field(
        self, gym_id: UUID, field_id: UUID, data: dict
    ) -> ExpenseCategoryField:
        """Update a custom field definition."""
        field = await self.field_repo.get_by_id(field_id, gym_id)
        if not field:
            raise NotFoundError("Category field not found")

        allowed = {"label", "field_type", "options", "is_required", "sort_order", "is_active"}
        for key, value in data.items():
            if key in allowed and value is not None:
                if key == "options" and field.field_type != "dropdown":
                    continue
                setattr(field, key, value)

        await self.db.flush()
        return field

    # === Expense Operations ===

    async def create_expense(
        self, gym_id: UUID, user_id: UUID, data: ExpenseCreate
    ) -> Expense:
        """Record an expense."""
        # Verify category exists and belongs to this gym
        category = await self.category_repo.get_by_id(data.category_id, gym_id)
        if not category:
            raise NotFoundError("Expense category not found")

        # Validate required custom fields
        if category.fields:
            active_fields = [f for f in category.fields if f.is_active]
            required_fields = [f for f in active_fields if f.is_required]
            custom_data = data.custom_data or {}

            for field in required_fields:
                if field.field_key not in custom_data or not custom_data[field.field_key]:
                    raise ValidationError(
                        f"Required field '{field.label}' is missing"
                    )

        expense = Expense(
            gym_id=gym_id,
            category_id=data.category_id,
            amount_in_paise=data.amount_in_paise,
            expense_date=data.expense_date,
            description=data.description,
            receipt_url=data.receipt_url,
            custom_data=data.custom_data,
            created_by=user_id,
        )
        expense = await self.expense_repo.create(expense)
        logger.info(
            f"Expense recorded: ₹{data.amount_in_paise / 100:.2f} in "
            f"'{category.name}' for gym {gym_id}"
        )
        return expense

    async def update_expense(
        self, gym_id: UUID, expense_id: UUID, data: ExpenseUpdate
    ) -> Expense:
        """Update an existing expense record."""
        expense = await self.expense_repo.get_by_id(expense_id, gym_id)
        if not expense:
            raise NotFoundError("Expense not found")

        if data.category_id is not None:
            category = await self.category_repo.get_by_id(data.category_id, gym_id)
            if not category:
                raise NotFoundError("Expense category not found")
            expense.category_id = data.category_id

        if data.amount_in_paise is not None:
            expense.amount_in_paise = data.amount_in_paise
        if data.expense_date is not None:
            expense.expense_date = data.expense_date
        if data.description is not None:
            expense.description = data.description
        if data.receipt_url is not None:
            expense.receipt_url = data.receipt_url
        if data.custom_data is not None:
            expense.custom_data = data.custom_data

        await self.db.flush()
        return expense

    async def delete_expense(self, gym_id: UUID, expense_id: UUID) -> None:
        """Delete an expense record."""
        expense = await self.expense_repo.get_by_id(expense_id, gym_id)
        if not expense:
            raise NotFoundError("Expense not found")
        await self.expense_repo.delete(expense)

    async def list_expenses(
        self,
        gym_id: UUID,
        skip: int = 0,
        limit: int = 50,
        category_id: UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> tuple[list[Expense], int]:
        """List expenses with optional filters. Returns (expenses, total_count)."""
        expenses = await self.expense_repo.list_by_gym(
            gym_id, skip, limit, category_id, date_from, date_to
        )
        total = await self.expense_repo.count_by_gym(
            gym_id, category_id, date_from, date_to
        )
        return expenses, total

    # === Dashboard Analytics ===

    async def get_dashboard(self, gym_id: UUID) -> ExpenseDashboardResponse:
        """Full expense dashboard with breakdown, trends, and recurring status."""
        today = today_ist()
        month_start = today.replace(day=1)

        # Previous month
        prev_month_end = month_start - __import__("datetime").timedelta(days=1)
        prev_month_start = prev_month_end.replace(day=1)

        # This month total
        total_this_month = await self.expense_repo.sum_by_period(
            gym_id, month_start, today
        )

        # Last month total
        total_last_month = await self.expense_repo.sum_by_period(
            gym_id, prev_month_start, prev_month_end
        )

        # Category count
        category_count = await self.category_repo.count_by_gym(gym_id)

        # Category breakdown for this month
        breakdown_rows = await self.expense_repo.sum_by_category(
            gym_id, month_start, today
        )
        total_for_pct = total_this_month if total_this_month > 0 else 1
        category_breakdown = [
            CategoryBreakdown(
                category_id=row.category_id,
                category_name=row.name,
                category_color=row.color,
                total_paise=int(row.total),
                count=int(row.count),
                percentage=round((int(row.total) / total_for_pct) * 100, 1),
            )
            for row in breakdown_rows
        ]

        # Monthly trend (last 6 months)
        trend_rows = await self.expense_repo.monthly_trend(gym_id, months=6)
        monthly_trend = [
            MonthlyTrend(
                month=f"{int(row.year)}-{int(row.month):02d}",
                total_paise=int(row.total),
            )
            for row in trend_rows
        ]

        # Recurring status
        categories = await self.category_repo.list_by_gym(gym_id, active_only=True)
        recurring_categories = [c for c in categories if c.is_recurring]
        recurring_status = []
        for cat in recurring_categories:
            last_expense = await self.expense_repo.get_last_expense_for_category(
                gym_id, cat.id
            )
            is_recorded = False
            last_amount = None
            if last_expense:
                last_amount = last_expense.amount_in_paise
                if (
                    last_expense.expense_date.year == today.year
                    and last_expense.expense_date.month == today.month
                ):
                    is_recorded = True

            recurring_status.append(
                RecurringStatus(
                    category_id=cat.id,
                    category_name=cat.name,
                    recurring_day=cat.recurring_day,
                    is_recorded_this_month=is_recorded,
                    last_amount_paise=last_amount,
                )
            )

        # Budget alerts — categories where spending exceeds budget
        budget_alerts = []
        for item in category_breakdown:
            # Find the category to check budget
            cat = next((c for c in categories if c.id == item.category_id), None)
            if cat and cat.budget_limit_paise and item.total_paise > cat.budget_limit_paise:
                budget_alerts.append(item)

        return ExpenseDashboardResponse(
            total_this_month_paise=total_this_month,
            total_last_month_paise=total_last_month,
            category_count=category_count,
            category_breakdown=category_breakdown,
            monthly_trend=monthly_trend,
            recurring_status=recurring_status,
            budget_alerts=budget_alerts,
        )
