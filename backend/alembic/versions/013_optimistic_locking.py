"""Add version column for optimistic locking

Revision ID: 013
Revises: 012
Create Date: 2025-01-01
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "013_optimistic_locking"
down_revision = "012_payment_idempotency_and_token_grace"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "members",
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("members", "version")
