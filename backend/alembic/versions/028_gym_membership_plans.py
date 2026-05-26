"""Add gym_membership_plans table

Revision ID: 028_gym_membership_plans
Revises: 028_payment_edit
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "028_gym_membership_plans"
down_revision = "028_payment_edit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gym_membership_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("gym_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("duration_months", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_gym_membership_plans_gym_id", "gym_membership_plans", ["gym_id"])
    op.execute(
        "CREATE UNIQUE INDEX uq_gym_membership_plans_gym_name "
        "ON gym_membership_plans (gym_id, name) WHERE is_active = true"
    )


def downgrade() -> None:
    op.drop_index("uq_gym_membership_plans_gym_name", table_name="gym_membership_plans")
    op.drop_index("ix_gym_membership_plans_gym_id", table_name="gym_membership_plans")
    op.drop_table("gym_membership_plans")
