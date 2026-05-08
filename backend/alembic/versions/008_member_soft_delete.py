"""Add is_deleted column to members for soft-delete support.

Revision ID: 008
Revises: 007
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "members",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index("ix_members_is_deleted", "members", ["gym_id", "is_deleted"])


def downgrade() -> None:
    op.drop_index("ix_members_is_deleted", table_name="members")
    op.drop_column("members", "is_deleted")
