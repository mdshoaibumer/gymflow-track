"""Add due management tables

Revision ID: 032_due_management
Revises: 031_biometric_attendance
Create Date: 2026-06-07

Adds:
- 'duestatus' enum (pending, partial, paid, waived)
- 'member_dues' table for tracking outstanding balances per billing cycle
- 'due_payments' table linking individual payments to dues
- Partial indexes for efficient aging and balance queries
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ENUM


revision = "032_due_management"
down_revision = "031_biometric_attendance"
branch_labels = None
depends_on = None

# Reference only – never auto-creates the type
duestatus_enum = ENUM("pending", "partial", "paid", "waived", name="duestatus", create_type=False)


def upgrade() -> None:
    # 1. Create duestatus enum idempotently via raw SQL
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE duestatus AS ENUM ('pending', 'partial', 'paid', 'waived');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """))

    # 2. Add 'due_waived' to gymauditaction enum
    op.execute("ALTER TYPE gymauditaction ADD VALUE IF NOT EXISTS 'due_waived'")

    # 3. Create member_dues table
    op.create_table(
        "member_dues",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("gym_id", UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", UUID(as_uuid=True), sa.ForeignKey("members.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("plan_name", sa.String(100), nullable=False),
        sa.Column("plan_amount_paise", sa.Integer, nullable=False),
        sa.Column("discount_paise", sa.Integer, nullable=False, server_default="0"),
        sa.Column("effective_amount_paise", sa.Integer, nullable=False),
        sa.Column("total_paid_paise", sa.Integer, nullable=False, server_default="0"),
        sa.Column("balance_paise", sa.Integer, nullable=False),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column("status", duestatus_enum, nullable=False, server_default="pending"),
        sa.Column("waive_reason", sa.Text, nullable=True),
        sa.Column("waived_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Indexes for member_dues
    op.create_index("ix_member_dues_gym_id", "member_dues", ["gym_id"])
    op.create_index("ix_member_dues_gym_status", "member_dues", ["gym_id", "status"])
    op.create_index("ix_member_dues_member", "member_dues", ["member_id"])

    # Partial indexes for active dues (pending/partial only)
    op.execute(
        "CREATE INDEX ix_member_dues_gym_balance ON member_dues (gym_id, balance_paise DESC) "
        "WHERE status IN ('pending', 'partial')"
    )
    op.execute(
        "CREATE INDEX ix_member_dues_gym_due_date ON member_dues (gym_id, due_date) "
        "WHERE status IN ('pending', 'partial')"
    )

    # 3. Create due_payments table
    op.create_table(
        "due_payments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("gym_id", UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("due_id", UUID(as_uuid=True), sa.ForeignKey("member_dues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payment_id", UUID(as_uuid=True), sa.ForeignKey("payments.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount_paise", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("ix_due_payments_due", "due_payments", ["due_id"])
    op.create_index("ix_due_payments_payment", "due_payments", ["payment_id"])


def downgrade() -> None:
    op.drop_table("due_payments")
    op.drop_table("member_dues")
    op.execute(sa.text("DROP TYPE IF EXISTS duestatus"))
