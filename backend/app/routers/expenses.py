"""
Expense Management API routes.

RBAC:
- GET dashboard: OWNER only (financial overview)
- GET list/detail: ADMIN+ (operational expense management)
- GET categories: All authenticated roles (labels only)
- POST/PUT (create, update): ADMIN+
- DELETE: OWNER only
- Category management: OWNER only
"""

from datetime import date
from uuid import UUID
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_admin, require_owner
from app.schemas.expense import (
    ExpenseCategoryCreate,
    ExpenseCategoryFieldCreate,
    ExpenseCategoryFieldResponse,
    ExpenseCategoryListResponse,
    ExpenseCategoryResponse,
    ExpenseCategoryUpdate,
    ExpenseCreate,
    ExpenseDashboardResponse,
    ExpenseListResponse,
    ExpenseResponse,
    ExpenseUpdate,
)
from app.models.expense import Expense
from app.services.expense_service import ExpenseService

logger = logging.getLogger("gymflow.expenses")

router = APIRouter()


# === Dashboard ===


@router.get("/dashboard", response_model=ExpenseDashboardResponse)
async def get_expense_dashboard(
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get expense dashboard with breakdown, trends, recurring status, and budget alerts. OWNER only."""
    service = ExpenseService(db)
    return await service.get_dashboard(current_user.gym_id)


# === Category Management ===


@router.get("/categories", response_model=ExpenseCategoryListResponse)
async def list_categories(
    active_only: bool = Query(True),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all expense categories for the current gym."""
    service = ExpenseService(db)
    categories = await service.list_categories(current_user.gym_id, active_only)
    return ExpenseCategoryListResponse(
        categories=categories, total=len(categories)
    )


@router.post("/categories", response_model=ExpenseCategoryResponse, status_code=201)
async def create_category(
    data: ExpenseCategoryCreate,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Create a new expense category with optional custom fields. OWNER only."""
    service = ExpenseService(db)
    category = await service.create_category(current_user.gym_id, data)
    return category


@router.get("/categories/{category_id}", response_model=ExpenseCategoryResponse)
async def get_category(
    category_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific expense category with its fields."""
    service = ExpenseService(db)
    return await service.get_category(current_user.gym_id, category_id)


@router.patch("/categories/{category_id}", response_model=ExpenseCategoryResponse)
async def update_category(
    category_id: UUID,
    data: ExpenseCategoryUpdate,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update an expense category. OWNER only."""
    service = ExpenseService(db)
    return await service.update_category(current_user.gym_id, category_id, data)


# === Category Field Management ===


@router.post(
    "/categories/{category_id}/fields",
    response_model=ExpenseCategoryFieldResponse,
    status_code=201,
)
async def add_category_field(
    category_id: UUID,
    data: ExpenseCategoryFieldCreate,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Add a custom field to an expense category. OWNER only."""
    service = ExpenseService(db)
    field = await service.add_field_to_category(
        current_user.gym_id, category_id, data
    )
    return field


@router.patch(
    "/categories/fields/{field_id}",
    response_model=ExpenseCategoryFieldResponse,
)
async def update_category_field(
    field_id: UUID,
    data: dict,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update a category custom field. OWNER only."""
    service = ExpenseService(db)
    return await service.update_category_field(current_user.gym_id, field_id, data)


# === Expense CRUD ===


@router.get("", response_model=ExpenseListResponse)
async def list_expenses(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    category_id: UUID | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List expenses with optional filters. ADMIN/OWNER only."""
    service = ExpenseService(db)
    expenses, total = await service.list_expenses(
        current_user.gym_id, skip, limit, category_id, date_from, date_to
    )
    return ExpenseListResponse(
        expenses=[_expense_to_response(e) for e in expenses],
        total=total,
    )


@router.post("", response_model=ExpenseResponse, status_code=201)
async def create_expense(
    data: ExpenseCreate,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Record a new expense. ADMIN/OWNER only."""
    service = ExpenseService(db)
    expense = await service.create_expense(
        current_user.gym_id, current_user.user_id, data
    )
    return _expense_to_response(expense)


@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_expense(
    expense_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific expense record. ADMIN/OWNER only."""
    service = ExpenseService(db)
    expense = await service.expense_repo.get_by_id(expense_id, current_user.gym_id)
    if not expense:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Expense not found")
    return _expense_to_response(expense)


@router.patch("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: UUID,
    data: ExpenseUpdate,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update an expense record. ADMIN/OWNER only."""
    service = ExpenseService(db)
    expense = await service.update_expense(current_user.gym_id, expense_id, data)
    return _expense_to_response(expense)


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: UUID,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Delete an expense record. OWNER only."""
    service = ExpenseService(db)
    await service.delete_expense(current_user.gym_id, expense_id)


# === Helpers ===


def _expense_to_response(expense: Expense) -> ExpenseResponse:
    """Convert an Expense ORM model to response schema with category info."""
    return ExpenseResponse(
        id=expense.id,
        gym_id=expense.gym_id,
        category_id=expense.category_id,
        category_name=expense.category.name if expense.category else None,
        category_color=expense.category.color if expense.category else None,
        category_icon=expense.category.icon if expense.category else None,
        amount_in_paise=expense.amount_in_paise,
        expense_date=expense.expense_date,
        description=expense.description,
        receipt_url=expense.receipt_url,
        custom_data=expense.custom_data,
        created_by=expense.created_by,
    )
