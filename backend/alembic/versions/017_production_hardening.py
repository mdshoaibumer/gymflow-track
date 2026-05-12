"""Production hardening: FK safety, missing indexes, payment audit trail protection.

Changes:
1. payments.member_id FK: CASCADE → RESTRICT
   - Prevents accidental hard-deletes from destroying the financial audit trail.
   - Members are soft-deleted (is_deleted flag), so RESTRICT never blocks
     normal operations. But a direct SQL `DELETE FROM members` will now fail
     if the member has payment records — which is the correct behavior for
     a financial SaaS.

2. Add index on refresh_tokens(user_id, revoked) for logout-all queries.
   - The logout-all operation updates all non-revoked tokens for a user.
   - Without this index, it does a full table scan filtered by user_id.

3. Add index on invoices(subscription_id) for FK lookups.
   - Foreign key columns should always be indexed for JOIN performance.

All operations are idempotent and safe for zero-downtime deployment.

Revision ID: 017_production_hardening
Revises: d8f6328dac88
"""
from alembic import op

revision = "017_production_hardening"
down_revision = "d8f6328dac88"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Change payments.member_id FK from CASCADE to RESTRICT.
    # Drop the existing FK constraint and recreate with RESTRICT.
    # This protects the payment audit trail from accidental hard-deletes.
    op.execute("""
        DO $$
        DECLARE
            fk_name TEXT;
        BEGIN
            SELECT constraint_name INTO fk_name
            FROM information_schema.table_constraints
            WHERE table_name = 'payments'
              AND constraint_type = 'FOREIGN KEY'
              AND constraint_name LIKE '%member_id%'
            LIMIT 1;

            IF fk_name IS NOT NULL THEN
                EXECUTE 'ALTER TABLE payments DROP CONSTRAINT ' || fk_name;
            END IF;
        END $$;
    """)
    op.execute("""
        ALTER TABLE payments
        ADD CONSTRAINT fk_payments_member_id
        FOREIGN KEY (member_id) REFERENCES members(id)
        ON DELETE RESTRICT
    """)

    # 2. Composite index for logout-all queries:
    # UPDATE refresh_tokens SET revoked=true WHERE user_id=? AND revoked=false
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_revoked "
        "ON refresh_tokens (user_id, revoked)"
    )

    # 3. Index on invoices.subscription_id for FK lookups
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_invoices_subscription_id "
        "ON invoices (subscription_id)"
    )


def downgrade() -> None:
    # Revert FK to CASCADE (original behavior)
    op.execute("""
        DO $$
        DECLARE
            fk_name TEXT;
        BEGIN
            SELECT constraint_name INTO fk_name
            FROM information_schema.table_constraints
            WHERE table_name = 'payments'
              AND constraint_type = 'FOREIGN KEY'
              AND constraint_name LIKE '%member_id%'
            LIMIT 1;

            IF fk_name IS NOT NULL THEN
                EXECUTE 'ALTER TABLE payments DROP CONSTRAINT ' || fk_name;
            END IF;
        END $$;
    """)
    op.execute("""
        ALTER TABLE payments
        ADD CONSTRAINT fk_payments_member_id
        FOREIGN KEY (member_id) REFERENCES members(id)
        ON DELETE CASCADE
    """)

    op.execute("DROP INDEX IF EXISTS ix_refresh_tokens_user_revoked")
    op.execute("DROP INDEX IF EXISTS ix_invoices_subscription_id")
