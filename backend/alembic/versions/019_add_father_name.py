"""Add father_name column to members table

Revision ID: 019
Revises: 018
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("members", sa.Column("father_name", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("members", "father_name")
