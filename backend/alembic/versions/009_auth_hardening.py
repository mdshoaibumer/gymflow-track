"""Auth hardening: refresh token tracking, password reset tokens, global email uniqueness.

Revision ID: 009_auth_hardening
Revises: 008_member_soft_delete
Create Date: 2026-05-09 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = "009_auth_hardening"
down_revision = "008_member_soft_delete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Refresh token tracking ---
    op.create_table(
        "refresh_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("device_info", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_refresh_tokens_user", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_hash", "refresh_tokens", ["token_hash"], unique=True)

    # --- Password reset tokens ---
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_password_reset_tokens_hash", "password_reset_tokens", ["token_hash"], unique=True)
    op.create_index("ix_password_reset_tokens_user", "password_reset_tokens", ["user_id"])

    # --- Global email uniqueness on users ---
    # The application already assumes email is globally unique (login by email),
    # but the DB constraint was only per-gym. Add a global unique index.
    op.create_index("ix_users_email_global", "users", ["email"], unique=True)

    # --- Composite index on gym_subscriptions (gym_id, status) for billing queries ---
    op.create_index("ix_gym_subscriptions_gym_status", "gym_subscriptions", ["gym_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_gym_subscriptions_gym_status", table_name="gym_subscriptions")
    op.drop_index("ix_users_email_global", table_name="users")
    op.drop_table("password_reset_tokens")
    op.drop_table("refresh_tokens")
