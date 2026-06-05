"""
Expense Management Models — Dynamic Categories & Custom Fields.

Design Philosophy:
- Gym owners define their OWN expense categories (no hardcoded types)
- Each category can have custom fields (stored as JSONB on expense records)
- Recurring expenses are tracked with auto-reminders
- All money stored in paise (INR * 100) for exact arithmetic

Architecture:
- ExpenseCategory: Owner-defined types (Rent, Electricity, Salary, etc.)
- ExpenseCategoryField: Custom metadata fields per category
- Expense: Actual expense records with JSONB custom_data
"""

import uuid
from datetime import date
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


# === Enums ===


class ExpenseFieldType(str, PyEnum):
    TEXT = "text"
    NUMBER = "number"
    DATE = "date"
    DROPDOWN = "dropdown"


# === Expense Category Model ===


class ExpenseCategory(BaseModel):
    """
    Owner-defined expense categories.
    Each gym can create unlimited categories (Rent, Electricity, Salary, etc.)
    """
    __tablename__ = "expense_categories"
    __table_args__ = (
        Index("ix_expense_categories_gym", "gym_id"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recurring_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    budget_limit_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    gym = relationship("Gym", lazy="raise")
    fields = relationship(
        "ExpenseCategoryField", back_populates="category",
        lazy="raise", cascade="all, delete-orphan",
    )
    expenses = relationship(
        "Expense", back_populates="category",
        lazy="raise",
    )


# === Expense Category Field Model ===


class ExpenseCategoryField(BaseModel):
    """
    Custom fields defined per expense category.
    Owner can add any fields they want (Meter Reading, Bill Number, Vendor, etc.)
    Values are stored as JSONB on the Expense record.
    """
    __tablename__ = "expense_category_fields"
    __table_args__ = (
        Index("ix_expense_category_fields_category", "category_id"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="CASCADE"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    field_type: Mapped[str] = mapped_column(String(20), nullable=False, default="text")
    options: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    category = relationship("ExpenseCategory", back_populates="fields", lazy="raise")


# === Expense Model ===


class Expense(BaseModel):
    """
    Actual expense records. Stores amount + date + owner-defined custom fields as JSONB.
    """
    __tablename__ = "expenses"
    __table_args__ = (
        Index("ix_expenses_gym_date", "gym_id", "expense_date"),
        Index("ix_expenses_gym_category", "gym_id", "category_id"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount_in_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    receipt_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    custom_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    category = relationship("ExpenseCategory", back_populates="expenses", lazy="joined")
    gym = relationship("Gym", lazy="raise")
