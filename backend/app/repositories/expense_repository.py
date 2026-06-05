"""Repository layer for expense management — data access with tenant isolation."""
from datetime import date
from uuid import UUID

from sqlalchemy import select, func, extract
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.expense import Expense, ExpenseCategory, ExpenseCategoryField


class ExpenseCategoryRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, category: ExpenseCategory) -> ExpenseCategory:
        self.db.add(category)
        await self.db.flush()
        return category

    async def get_by_id(self, category_id: UUID, gym_id: UUID) -> ExpenseCategory | None:
        result = await self.db.execute(
            select(ExpenseCategory)
            .options(selectinload(ExpenseCategory.fields))
            .where(
                ExpenseCategory.id == category_id,
                ExpenseCategory.gym_id == gym_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_gym(
        self, gym_id: UUID, active_only: bool = True
    ) -> list[ExpenseCategory]:
        query = (
            select(ExpenseCategory)
            .options(selectinload(ExpenseCategory.fields))
            .where(ExpenseCategory.gym_id == gym_id)
        )
        if active_only:
            query = query.where(ExpenseCategory.is_active == True)  # noqa: E712
        query = query.order_by(ExpenseCategory.sort_order, ExpenseCategory.created_at)
        result = await self.db.execute(query)
        return list(result.scalars().unique().all())

    async def count_by_gym(self, gym_id: UUID, active_only: bool = True) -> int:
        query = select(func.count()).select_from(ExpenseCategory).where(
            ExpenseCategory.gym_id == gym_id
        )
        if active_only:
            query = query.where(ExpenseCategory.is_active == True)  # noqa: E712
        result = await self.db.execute(query)
        return result.scalar_one()


class ExpenseCategoryFieldRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, field: ExpenseCategoryField) -> ExpenseCategoryField:
        self.db.add(field)
        await self.db.flush()
        return field

    async def get_by_id(self, field_id: UUID, gym_id: UUID) -> ExpenseCategoryField | None:
        result = await self.db.execute(
            select(ExpenseCategoryField).where(
                ExpenseCategoryField.id == field_id,
                ExpenseCategoryField.gym_id == gym_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_category(
        self, category_id: UUID, active_only: bool = True
    ) -> list[ExpenseCategoryField]:
        query = select(ExpenseCategoryField).where(
            ExpenseCategoryField.category_id == category_id
        )
        if active_only:
            query = query.where(ExpenseCategoryField.is_active == True)  # noqa: E712
        query = query.order_by(ExpenseCategoryField.sort_order)
        result = await self.db.execute(query)
        return list(result.scalars().all())


class ExpenseRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, expense: Expense) -> Expense:
        self.db.add(expense)
        await self.db.flush()
        return expense

    async def get_by_id(self, expense_id: UUID, gym_id: UUID) -> Expense | None:
        result = await self.db.execute(
            select(Expense)
            .options(selectinload(Expense.category))
            .where(
                Expense.id == expense_id,
                Expense.gym_id == gym_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_gym(
        self,
        gym_id: UUID,
        skip: int = 0,
        limit: int = 50,
        category_id: UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[Expense]:
        query = (
            select(Expense)
            .options(selectinload(Expense.category))
            .where(Expense.gym_id == gym_id)
        )
        if category_id:
            query = query.where(Expense.category_id == category_id)
        if date_from:
            query = query.where(Expense.expense_date >= date_from)
        if date_to:
            query = query.where(Expense.expense_date <= date_to)

        query = query.order_by(Expense.expense_date.desc(), Expense.created_at.desc())
        result = await self.db.execute(query.offset(skip).limit(limit))
        return list(result.scalars().unique().all())

    async def count_by_gym(
        self,
        gym_id: UUID,
        category_id: UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> int:
        query = select(func.count()).select_from(Expense).where(Expense.gym_id == gym_id)
        if category_id:
            query = query.where(Expense.category_id == category_id)
        if date_from:
            query = query.where(Expense.expense_date >= date_from)
        if date_to:
            query = query.where(Expense.expense_date <= date_to)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def sum_by_period(
        self, gym_id: UUID, date_from: date, date_to: date
    ) -> int:
        """Total expenses in paise for a date range."""
        result = await self.db.execute(
            select(func.coalesce(func.sum(Expense.amount_in_paise), 0)).where(
                Expense.gym_id == gym_id,
                Expense.expense_date >= date_from,
                Expense.expense_date <= date_to,
            )
        )
        return result.scalar_one()

    async def sum_by_category(
        self, gym_id: UUID, date_from: date, date_to: date
    ) -> list[tuple]:
        """Sum expenses grouped by category for a date range."""
        result = await self.db.execute(
            select(
                Expense.category_id,
                ExpenseCategory.name,
                ExpenseCategory.color,
                func.sum(Expense.amount_in_paise).label("total"),
                func.count(Expense.id).label("count"),
            )
            .join(ExpenseCategory, Expense.category_id == ExpenseCategory.id)
            .where(
                Expense.gym_id == gym_id,
                Expense.expense_date >= date_from,
                Expense.expense_date <= date_to,
            )
            .group_by(Expense.category_id, ExpenseCategory.name, ExpenseCategory.color)
            .order_by(func.sum(Expense.amount_in_paise).desc())
        )
        return list(result.all())

    async def monthly_trend(
        self, gym_id: UUID, months: int = 6
    ) -> list[tuple]:
        """Monthly expense totals for the last N months."""
        from datetime import timedelta
        from app.core.timezone import today_ist

        today = today_ist()
        start_date = date(today.year, today.month, 1)
        # Go back N months
        for _ in range(months - 1):
            start_date = (start_date - timedelta(days=1)).replace(day=1)

        result = await self.db.execute(
            select(
                extract("year", Expense.expense_date).label("year"),
                extract("month", Expense.expense_date).label("month"),
                func.sum(Expense.amount_in_paise).label("total"),
            )
            .where(
                Expense.gym_id == gym_id,
                Expense.expense_date >= start_date,
            )
            .group_by(
                extract("year", Expense.expense_date),
                extract("month", Expense.expense_date),
            )
            .order_by(
                extract("year", Expense.expense_date),
                extract("month", Expense.expense_date),
            )
        )
        return list(result.all())

    async def get_last_expense_for_category(
        self, gym_id: UUID, category_id: UUID
    ) -> Expense | None:
        """Get the most recent expense for a category (for recurring status)."""
        result = await self.db.execute(
            select(Expense)
            .where(
                Expense.gym_id == gym_id,
                Expense.category_id == category_id,
            )
            .order_by(Expense.expense_date.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def delete(self, expense: Expense) -> None:
        await self.db.delete(expense)
        await self.db.flush()
