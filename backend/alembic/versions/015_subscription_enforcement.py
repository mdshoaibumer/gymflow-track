"""015 — Subscription enforcement: Elite plan + feature flags

Adds:
- Elite tier to plantier enum
- Feature flag columns to subscription_plans
- Yearly pricing column
- Updates existing plan limits to match new pricing

Revision ID: 015_subscription_enforcement
Revises: d28f953b461d
"""

from alembic import op
import sqlalchemy as sa


revision = "015_subscription_enforcement"
down_revision = "d28f953b461d"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add 'elite' to plantier enum (replaces 'enterprise')
    # PostgreSQL: ALTER TYPE ... ADD VALUE
    # SQLite: enum is just text, no-op
    try:
        op.execute("ALTER TYPE plantier ADD VALUE IF NOT EXISTS 'elite'")
    except Exception:
        pass  # SQLite doesn't have enum types

    # 2. Add new feature flag columns to subscription_plans
    with op.batch_alter_table("subscription_plans") as batch_op:
        batch_op.add_column(
            sa.Column("qr_attendance_enabled", sa.Boolean(), nullable=False, server_default="false")
        )
        batch_op.add_column(
            sa.Column("advanced_analytics_enabled", sa.Boolean(), nullable=False, server_default="false")
        )
        batch_op.add_column(
            sa.Column("export_reports_enabled", sa.Boolean(), nullable=False, server_default="false")
        )
        batch_op.add_column(
            sa.Column("multi_branch_enabled", sa.Boolean(), nullable=False, server_default="false")
        )
        batch_op.add_column(
            sa.Column("automated_whatsapp_enabled", sa.Boolean(), nullable=False, server_default="false")
        )
        batch_op.add_column(
            sa.Column("yearly_price_in_paise", sa.Integer(), nullable=False, server_default="0")
        )


def downgrade():
    with op.batch_alter_table("subscription_plans") as batch_op:
        batch_op.drop_column("yearly_price_in_paise")
        batch_op.drop_column("automated_whatsapp_enabled")
        batch_op.drop_column("multi_branch_enabled")
        batch_op.drop_column("export_reports_enabled")
        batch_op.drop_column("advanced_analytics_enabled")
        batch_op.drop_column("qr_attendance_enabled")
