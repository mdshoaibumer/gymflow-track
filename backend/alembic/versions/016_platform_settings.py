"""016 — Platform settings table + enhanced audit actions

Adds:
- platform_settings table for global SaaS configuration
- New audit action enum values

Revision ID: 016_platform_settings
Revises: 015_subscription_enforcement
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "016_platform_settings"
down_revision = "014_super_admin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create platform_settings table
    op.create_table(
        "platform_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("default_trial_days", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("grace_period_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("max_payment_retries", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("maintenance_mode", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("maintenance_message", sa.Text(), nullable=True),
        sa.Column("announcement_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("announcement_message", sa.Text(), nullable=True),
        sa.Column("announcement_type", sa.String(20), nullable=False, server_default="info"),
        sa.Column("max_gyms", sa.Integer(), nullable=False, server_default="10000"),
        sa.Column("feature_flags", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 2. Add new audit action enum values (PostgreSQL)
    # NOTE: ALTER TYPE ... ADD VALUE cannot be executed in a transaction block.
    op.execute("COMMIT")
    new_actions = [
        "subscription_cancelled",
        "payment_marked_received",
        "gym_deleted",
        "settings_updated",
        "announcement_updated",
        "maintenance_mode_toggled",
    ]
    for action in new_actions:
        try:
            op.execute(f"ALTER TYPE auditaction ADD VALUE IF NOT EXISTS '{action}'")
        except Exception:
            pass  # SQLite or value already exists

    # 3. Seed default platform settings
    from uuid import uuid4
    settings_id = str(uuid4())
    op.execute(
        f"INSERT INTO platform_settings (id, default_trial_days, grace_period_days, max_payment_retries) "
        f"VALUES ('{settings_id}', 3, 7, 3)"
    )


def downgrade() -> None:
    op.drop_table("platform_settings")
