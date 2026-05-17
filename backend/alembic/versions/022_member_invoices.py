"""Add member_invoices table and gym logo_url

Revision ID: 022_member_invoices
Revises: 021_custom_fields
Create Date: 2026-05-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ENUM

revision = "022_member_invoices"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add logo_url to gyms table
    op.add_column("gyms", sa.Column("logo_url", sa.String(500), nullable=True))

    # Create member_invoices table
    op.create_table(
        "member_invoices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payment_id", UUID(as_uuid=True), sa.ForeignKey("payments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", UUID(as_uuid=True), sa.ForeignKey("members.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("invoice_number", sa.String(50), nullable=False),
        sa.Column("invoice_date", sa.Date, nullable=False),
        sa.Column("gym_name", sa.String(200), nullable=False),
        sa.Column("gym_address", sa.String(500), nullable=True),
        sa.Column("gym_phone", sa.String(15), nullable=True),
        sa.Column("gym_logo_url", sa.String(500), nullable=True),
        sa.Column("member_name", sa.String(200), nullable=False),
        sa.Column("member_phone", sa.String(15), nullable=False),
        sa.Column("amount_in_paise", sa.Integer, nullable=False),
        sa.Column("payment_method", ENUM("cash", "upi", "card", "bank_transfer", "other", name="paymentmethod", create_type=False), nullable=False),
        sa.Column("payment_date", sa.Date, nullable=False),
        sa.Column("plan_name", sa.String(200), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("ix_member_invoices_gym", "member_invoices", ["gym_id"])
    op.create_index("ix_member_invoices_member", "member_invoices", ["gym_id", "member_id"])
    op.create_index("ix_member_invoices_number", "member_invoices", ["gym_id", "invoice_number"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_member_invoices_number", table_name="member_invoices")
    op.drop_index("ix_member_invoices_member", table_name="member_invoices")
    op.drop_index("ix_member_invoices_gym", table_name="member_invoices")
    op.drop_table("member_invoices")
    op.drop_column("gyms", "logo_url")
