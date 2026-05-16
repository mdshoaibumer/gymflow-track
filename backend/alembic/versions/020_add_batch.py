"""Add batch column to members table

Revision ID: 020
Revises: 019
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the batch enum type
    batch_enum = sa.Enum("morning", "evening", "afternoon", name="batch")
    batch_enum.create(op.get_bind(), checkfirst=True)

    op.add_column("members", sa.Column("batch", batch_enum, nullable=True))


def downgrade() -> None:
    op.drop_column("members", "batch")

    # Drop the enum type
    sa.Enum(name="batch").drop(op.get_bind(), checkfirst=True)
