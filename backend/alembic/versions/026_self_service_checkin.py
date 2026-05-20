"""Add self_service to checkinsource enum

Revision ID: 026
Revises: 025
Create Date: 2026-05-20

Adds 'self_service' value to the checkinsource PostgreSQL enum type.
This enables tracking attendance marked via the self-service kiosk/QR web page.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "026_self_service_checkin"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE checkinsource ADD VALUE IF NOT EXISTS 'self_service'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values directly.
    pass
