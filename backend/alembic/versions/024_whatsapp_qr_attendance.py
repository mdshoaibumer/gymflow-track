"""Add whatsapp_qr to checkinsource enum

Revision ID: 024
Revises: 023_whatsapp_config
Create Date: 2026-05-18

Adds 'whatsapp_qr' value to the checkinsource PostgreSQL enum type.
This enables tracking attendance marked via WhatsApp QR scanning.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "024_whatsapp_qr_attendance"
down_revision = "023_whatsapp_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new enum value to the existing checkinsource type
    op.execute("ALTER TYPE checkinsource ADD VALUE IF NOT EXISTS 'whatsapp_qr'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values directly.
    # In practice, this is a one-way migration. The enum value is harmless if unused.
    pass
