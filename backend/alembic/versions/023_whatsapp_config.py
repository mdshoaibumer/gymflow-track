"""Add whatsapp_configs table for per-gym AiSensy configuration.

Revision ID: 023
Revises: 022
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("api_key", sa.Text(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("campaign_prefix", sa.String(100), nullable=True),
        sa.Column("provider_url", sa.String(500), nullable=False, server_default="https://backend.aisensy.com"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_whatsapp_configs_gym_id", "whatsapp_configs", ["gym_id"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_configs_gym_id")
    op.drop_table("whatsapp_configs")
