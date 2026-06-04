"""Add tour_completed_at to users table

Revision ID: 029_tour_completed_at
Revises: 028_gym_membership_plans
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "029_tour_completed_at"
down_revision = "028_gym_membership_plans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("tour_completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "tour_completed_at")
