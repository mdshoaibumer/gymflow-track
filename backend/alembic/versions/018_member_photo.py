"""Add photo_url column to members table.

Allows storing a relative URL to the member's uploaded photo.
Photos are stored on the filesystem under uploads/members/{gym_id}/{member_id}.{ext}.

Revision ID: 018_member_photo
Revises: 017_production_hardening
Create Date: 2026-05-16
"""

from alembic import op
import sqlalchemy as sa

revision = "018_member_photo"
down_revision = "017_production_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("members", sa.Column("photo_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("members", "photo_url")
