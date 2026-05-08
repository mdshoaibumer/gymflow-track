"""add payments table and membership status values

Revision ID: 002_payments
Revises: 001_initial_schema
Create Date: 2026-05-08

Adds:
- payments table with composite indexes for revenue queries
- New membership status enum values: pending, cancelled
- Payment method and status enum types
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "002_payments"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # === Extend membership_status enum ===
    # PostgreSQL requires ALTER TYPE to add values to an existing enum
    op.execute("ALTER TYPE membershipstatus ADD VALUE IF NOT EXISTS 'pending'")
    op.execute("ALTER TYPE membershipstatus ADD VALUE IF NOT EXISTS 'cancelled'")

    # === Create enum types for payments ===
    paymentmethod_enum = postgresql.ENUM(
        "cash", "upi", "card", "bank_transfer", "other",
        name="paymentmethod",
        create_type=False,
    )
    paymentstatus_enum = postgresql.ENUM(
        "completed", "pending", "failed", "refunded",
        name="paymentstatus",
        create_type=False,
    )
    paymentmethod_enum.create(op.get_bind(), checkfirst=True)
    paymentstatus_enum.create(op.get_bind(), checkfirst=True)

    # === PAYMENTS TABLE ===
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "gym_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("gyms.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("members.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("amount_in_paise", sa.Integer(), nullable=False),
        sa.Column(
            "payment_method",
            paymentmethod_enum,
            nullable=False,
        ),
        sa.Column(
            "payment_status",
            paymentstatus_enum,
            nullable=False,
            server_default="completed",
        ),
        sa.Column("payment_date", sa.Date(), nullable=False, index=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # Composite indexes for common query patterns
    op.create_index("ix_payments_gym_date", "payments", ["gym_id", "payment_date"])
    op.create_index("ix_payments_gym_member", "payments", ["gym_id", "member_id"])


def downgrade() -> None:
    op.drop_table("payments")
    sa.Enum(name="paymentmethod").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="paymentstatus").drop(op.get_bind(), checkfirst=True)
    # Note: Cannot remove enum values in PostgreSQL without recreating the type.
    # The added 'pending' and 'cancelled' values remain.
