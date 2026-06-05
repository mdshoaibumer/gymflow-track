"""add expense management tables

Revision ID: 030_expenses
Revises: 029_tour_completed_at
Create Date: 2026-06-05

Adds:
- expense_categories table for owner-defined expense types
- expense_category_fields table for custom metadata fields per category
- expenses table for actual expense records with JSONB custom_data
- Indexes for tenant-scoped queries, date ranges, and category lookups
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "030_expenses"
down_revision = "029_tour_completed_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Expense Categories table
    op.create_table(
        "expense_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("is_recurring", sa.Boolean, default=False, nullable=False, server_default="false"),
        sa.Column("recurring_day", sa.Integer, nullable=True),
        sa.Column("budget_limit_paise", sa.Integer, nullable=True),
        sa.Column("sort_order", sa.Integer, default=0, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_expense_categories_gym", "expense_categories", ["gym_id"])

    # Expense Category Fields table
    op.create_table(
        "expense_category_fields",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("field_key", sa.String(100), nullable=False),
        sa.Column("field_type", sa.String(20), nullable=False, server_default="text"),
        sa.Column("options", postgresql.JSONB, nullable=True),
        sa.Column("is_required", sa.Boolean, default=False, nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer, default=0, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_expense_category_fields_gym", "expense_category_fields", ["gym_id"])
    op.create_index("ix_expense_category_fields_category", "expense_category_fields", ["category_id"])

    # Expenses table
    op.create_table(
        "expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount_in_paise", sa.Integer, nullable=False),
        sa.Column("expense_date", sa.Date, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("receipt_url", sa.String(500), nullable=True),
        sa.Column("custom_data", postgresql.JSONB, nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_expenses_gym", "expenses", ["gym_id"])
    op.create_index("ix_expenses_gym_date", "expenses", ["gym_id", "expense_date"])
    op.create_index("ix_expenses_gym_category", "expenses", ["gym_id", "category_id"])


def downgrade() -> None:
    op.drop_table("expenses")
    op.drop_table("expense_category_fields")
    op.drop_table("expense_categories")
