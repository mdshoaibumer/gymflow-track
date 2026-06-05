"""Pydantic schemas for expense management."""
from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


# === Category Field Schemas ===


class ExpenseCategoryFieldCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    field_type: str = Field(default="text", pattern=r"^(text|number|date|dropdown)$")
    options: list[str] | None = None
    is_required: bool = False
    sort_order: int = 0


class ExpenseCategoryFieldUpdate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=100)
    field_type: str | None = Field(None, pattern=r"^(text|number|date|dropdown)$")
    options: list[str] | None = None
    is_required: bool | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class ExpenseCategoryFieldResponse(BaseModel):
    id: UUID
    label: str
    field_key: str
    field_type: str
    options: list[str] | None = None
    is_required: bool
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}


# === Category Schemas ===


class ExpenseCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, max_length=20)
    is_recurring: bool = False
    recurring_day: int | None = Field(None, ge=1, le=28)
    budget_limit_paise: int | None = Field(None, ge=0)
    sort_order: int = 0
    fields: list[ExpenseCategoryFieldCreate] | None = None


class ExpenseCategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, max_length=20)
    is_recurring: bool | None = None
    recurring_day: int | None = Field(None, ge=1, le=28)
    budget_limit_paise: int | None = Field(None, ge=0)
    sort_order: int | None = None
    is_active: bool | None = None


class ExpenseCategoryResponse(BaseModel):
    id: UUID
    gym_id: UUID
    name: str
    icon: str | None
    color: str | None
    is_recurring: bool
    recurring_day: int | None
    budget_limit_paise: int | None
    sort_order: int
    is_active: bool
    fields: list[ExpenseCategoryFieldResponse] = []

    model_config = {"from_attributes": True}


class ExpenseCategoryListResponse(BaseModel):
    categories: list[ExpenseCategoryResponse]
    total: int


# === Expense Schemas ===


class ExpenseCreate(BaseModel):
    category_id: UUID
    amount_in_paise: int = Field(..., gt=0)
    expense_date: date
    description: str | None = Field(None, max_length=500)
    receipt_url: str | None = Field(None, max_length=500)
    custom_data: dict | None = None


class ExpenseUpdate(BaseModel):
    category_id: UUID | None = None
    amount_in_paise: int | None = Field(None, gt=0)
    expense_date: date | None = None
    description: str | None = Field(None, max_length=500)
    receipt_url: str | None = Field(None, max_length=500)
    custom_data: dict | None = None


class ExpenseResponse(BaseModel):
    id: UUID
    gym_id: UUID
    category_id: UUID
    category_name: str | None = None
    category_color: str | None = None
    category_icon: str | None = None
    amount_in_paise: int
    expense_date: date
    description: str | None
    receipt_url: str | None
    custom_data: dict | None
    created_by: UUID | None

    model_config = {"from_attributes": True}


class ExpenseListResponse(BaseModel):
    expenses: list[ExpenseResponse]
    total: int


# === Dashboard / Analytics Schemas ===


class CategoryBreakdown(BaseModel):
    category_id: UUID
    category_name: str
    category_color: str | None
    total_paise: int
    count: int
    percentage: float


class MonthlyTrend(BaseModel):
    month: str
    total_paise: int


class RecurringStatus(BaseModel):
    category_id: UUID
    category_name: str
    recurring_day: int | None
    is_recorded_this_month: bool
    last_amount_paise: int | None


class ExpenseDashboardResponse(BaseModel):
    total_this_month_paise: int
    total_last_month_paise: int
    category_count: int
    category_breakdown: list[CategoryBreakdown]
    monthly_trend: list[MonthlyTrend]
    recurring_status: list[RecurringStatus]
    budget_alerts: list[CategoryBreakdown]
