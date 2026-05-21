"""Add discount_in_paise to payments and member_invoices

Revision ID: 027
Revises: 026_self_service_checkin
Create Date: 2026-05-21

Adds discount_in_paise column (default 0) to payments and member_invoices tables
for tracking discounts applied during payment recording.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "027_discount_field"
down_revision = "026_self_service_checkin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("discount_in_paise", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "member_invoices",
        sa.Column("discount_in_paise", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("member_invoices", "discount_in_paise")
    op.drop_column("payments", "discount_in_paise")
