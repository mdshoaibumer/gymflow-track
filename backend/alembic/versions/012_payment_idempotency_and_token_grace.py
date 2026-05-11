"""Add payment idempotency key and refresh token grace-period columns.

Changes:
1. payments.idempotency_key — client-supplied dedup key with a partial unique
   index scoped per gym (only WHERE idempotency_key IS NOT NULL so NULLs
   don't conflict and existing rows are unaffected).
2. refresh_tokens.revoked_at — timestamp of revocation for grace-window logic.
3. refresh_tokens.replaced_by_hash — pointer to the replacement token hash
   so concurrent multi-tab refreshes can look up the new token pair.

All operations are idempotent (IF NOT EXISTS / column existence checks) and
safe for production deployment with zero downtime. No data migration required.

Revision ID: 012_pay_idem_token_grace
Revises: 011_partial_unique_indexes
Create Date: 2026-05-10 00:00:00.000000

NOTE: Revision ID shortened from '012_payment_idempotency_and_token_grace'
to '012_pay_idem_token_grace' to fit within alembic_version.version_num
VARCHAR(32) column limit. See env.py for automatic column-width safeguard.
"""
from alembic import op, context
import sqlalchemy as sa

revision = "012_pay_idem_token_grace"
down_revision = "011_partial_unique_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # --- Payment idempotency key (idempotent: skip if column exists) ---
    if not context.is_offline_mode():
        result = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'payments' AND column_name = 'idempotency_key'"
        ))
        if not result.fetchone():
            op.add_column(
                "payments",
                sa.Column("idempotency_key", sa.String(64), nullable=True),
            )
    else:
        # In offline mode, we just emit the SQL and hope for the best
        # Actually, adding IF NOT EXISTS isn't possible for add_column in standard SQL
        # but for postgres we could use a DO block.
        op.execute("ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64)")
    # Partial unique index: only enforced when key is present.
    # Scoped per gym so different tenants can independently use keys.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_payments_idempotency "
        "ON payments (gym_id, idempotency_key) "
        "WHERE idempotency_key IS NOT NULL"
    )

    # --- Refresh token grace-period columns (idempotent: skip if exists) ---
    if not context.is_offline_mode():
        result = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'refresh_tokens' AND column_name = 'revoked_at'"
        ))
        if not result.fetchone():
            op.add_column(
                "refresh_tokens",
                sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            )

        result = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'refresh_tokens' AND column_name = 'replaced_by_hash'"
        ))
        if not result.fetchone():
            op.add_column(
                "refresh_tokens",
                sa.Column("replaced_by_hash", sa.String(64), nullable=True),
            )
    else:
        op.execute("ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE")
        op.execute("ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by_hash VARCHAR(64)")


def downgrade() -> None:
    op.drop_column("refresh_tokens", "replaced_by_hash")
    op.drop_column("refresh_tokens", "revoked_at")
    op.execute("DROP INDEX IF EXISTS ix_payments_idempotency")
    op.drop_column("payments", "idempotency_key")
