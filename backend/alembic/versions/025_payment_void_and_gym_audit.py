"""Payment void fields and gym audit logs table

Revision ID: 025
Revises: 024_whatsapp_qr_attendance
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers
revision = "025"
down_revision = "024_whatsapp_qr_attendance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add void fields to payments table
    op.add_column("payments", sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payments", sa.Column("voided_by", UUID(as_uuid=True), nullable=True))
    op.add_column("payments", sa.Column("void_reason", sa.Text(), nullable=True))

    # FK for voided_by
    op.create_foreign_key(
        "fk_payments_voided_by_users",
        "payments", "users",
        ["voided_by"], ["id"],
        ondelete="SET NULL",
    )

    # Create gym_audit_logs table
    op.execute("CREATE TYPE gymauditaction AS ENUM ('payment_voided', 'membership_override', 'member_financial_recompute')")

    op.create_table(
        "gym_audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.Enum("payment_voided", "membership_override", "member_financial_recompute", name="gymauditaction", create_type=False), nullable=False),
        sa.Column("old_data", JSONB, nullable=True),
        sa.Column("new_data", JSONB, nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("performed_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Indexes for gym_audit_logs
    op.create_index("ix_gym_audit_logs_gym", "gym_audit_logs", ["gym_id"])
    op.create_index("ix_gym_audit_logs_entity", "gym_audit_logs", ["entity_type", "entity_id"])
    op.create_index("ix_gym_audit_logs_action", "gym_audit_logs", ["action"])
    op.create_index("ix_gym_audit_logs_performed_by", "gym_audit_logs", ["performed_by"])
    op.create_index("ix_gym_audit_logs_created", "gym_audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_gym_audit_logs_created", table_name="gym_audit_logs")
    op.drop_index("ix_gym_audit_logs_performed_by", table_name="gym_audit_logs")
    op.drop_index("ix_gym_audit_logs_action", table_name="gym_audit_logs")
    op.drop_index("ix_gym_audit_logs_entity", table_name="gym_audit_logs")
    op.drop_index("ix_gym_audit_logs_gym", table_name="gym_audit_logs")
    op.drop_table("gym_audit_logs")
    op.execute("DROP TYPE gymauditaction")

    op.drop_constraint("fk_payments_voided_by_users", "payments", type_="foreignkey")
    op.drop_column("payments", "void_reason")
    op.drop_column("payments", "voided_by")
    op.drop_column("payments", "voided_at")
