"""Add payment_edited to gymauditaction enum

Revision ID: 028_payment_edit
Revises: 027_discount_field
Create Date: 2026-05-21

Adds 'payment_edited' value to the gymauditaction PostgreSQL enum type.
This enables logging when an admin/owner edits a payment.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "028_payment_edit"
down_revision = "027_discount_field"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new enum value to the existing gymauditaction type
    op.execute("ALTER TYPE gymauditaction ADD VALUE IF NOT EXISTS 'payment_edited'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values directly.
    pass
