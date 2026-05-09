"""Add pg_trgm extension and trigram GIN indexes for fast ILIKE search.

Revision ID: 010_trigram_indexes
Revises: 009_auth_hardening
Create Date: 2026-05-10 00:00:00.000000
"""
from alembic import op

revision = "010_trigram_indexes"
down_revision = "009_auth_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_members_name_trgm "
        "ON members USING gin (name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_members_phone_trgm "
        "ON members USING gin (phone gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_members_email_trgm "
        "ON members USING gin (email gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_members_email_trgm")
    op.execute("DROP INDEX IF EXISTS ix_members_phone_trgm")
    op.execute("DROP INDEX IF EXISTS ix_members_name_trgm")
