"""Replace unconditional unique constraints with partial unique indexes.

Fixes two production bugs:
1. Attendance: cancel-then-re-check-in hits IntegrityError because the old
   UniqueConstraint includes CANCELLED rows. The new partial index excludes them.
2. Members: soft-deleted members permanently block phone reuse because the old
   UniqueConstraint ignores is_deleted. The new partial index excludes deleted rows.

Both operations are idempotent (IF EXISTS / IF NOT EXISTS) and safe for
production deployment with zero downtime (CREATE INDEX CONCURRENTLY is not
used here because Alembic runs inside a transaction; the indexes are small
enough to build inline for typical gym-scale data).

Revision ID: 011_partial_unique_indexes
Revises: 010_trigram_indexes
Create Date: 2026-05-10 00:00:00.000000
"""
from alembic import op

revision = "011_partial_unique_indexes"
down_revision = "010_trigram_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Attendance: exclude cancelled rows from dedup constraint ---
    op.execute(
        "ALTER TABLE attendance "
        "DROP CONSTRAINT IF EXISTS uq_attendance_gym_member_date"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_gym_member_date "
        "ON attendance (gym_id, member_id, check_in_date) "
        "WHERE status != 'cancelled'"
    )

    # --- Members: exclude soft-deleted rows from phone uniqueness ---
    op.execute(
        "ALTER TABLE members "
        "DROP CONSTRAINT IF EXISTS uq_members_gym_phone"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_members_gym_phone "
        "ON members (gym_id, phone) "
        "WHERE is_deleted = false"
    )


def downgrade() -> None:
    # Restore original unconditional constraints

    # --- Attendance ---
    op.execute("DROP INDEX IF EXISTS uq_attendance_gym_member_date")
    op.execute(
        "ALTER TABLE attendance "
        "ADD CONSTRAINT uq_attendance_gym_member_date "
        "UNIQUE (gym_id, member_id, check_in_date)"
    )

    # --- Members ---
    op.execute("DROP INDEX IF EXISTS uq_members_gym_phone")
    op.execute(
        "ALTER TABLE members "
        "ADD CONSTRAINT uq_members_gym_phone "
        "UNIQUE (gym_id, phone)"
    )
