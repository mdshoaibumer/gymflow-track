"""Add super admin role, audit logs table, and make users.gym_id nullable.

Changes:
1. Alter users.gym_id to be nullable (super admins have no gym)
2. Add 'super_admin' to the userrole enum
3. Create audit_logs table for tracking admin actions
4. Add indexes for efficient audit log queries

Revision ID: 014_super_admin
Revises: 013_optimistic_locking
Create Date: 2026-05-11 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "014_super_admin"
down_revision = "015_subscription_enforcement"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Add 'super_admin' to userrole enum (idempotent)
    # PostgreSQL enums need ALTER TYPE to add values
    conn.execute(sa.text(
        "ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'super_admin' BEFORE 'owner'"
    ))

    # 2. Make users.gym_id nullable for super admins
    op.alter_column("users", "gym_id", existing_type=UUID(as_uuid=True), nullable=True)

    # 3. Create audit_logs table
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("target_gym_id", UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="SET NULL"), nullable=True),
        sa.Column("target_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("metadata_json", JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 4. Indexes for audit_logs
    op.create_index("ix_audit_logs_actor", "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_target_gym", "audit_logs", ["target_gym_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_created", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_target_gym", table_name="audit_logs")
    op.drop_index("ix_audit_logs_actor", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.alter_column("users", "gym_id", existing_type=UUID(as_uuid=True), nullable=False)
    # Note: Cannot easily remove an enum value in PostgreSQL
