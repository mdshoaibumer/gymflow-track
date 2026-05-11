"""fix_audit_log_enum

Revision ID: d8f6328dac88
Revises: 016_platform_settings
Create Date: 2026-05-11 17:38:45.161937
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8f6328dac88'
down_revision: Union[str, None] = '016_platform_settings'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create auditaction enum type (PostgreSQL only)
    # Note: If running on SQLite, this is a no-op as SQLAlchemy handles it inline.
    audit_action = sa.Enum(
        "trial_extended", "gym_suspended", "gym_unsuspended", "gym_locked", "gym_unlocked",
        "plan_changed", "subscription_activated", "subscription_cancelled",
        "impersonation_start", "impersonation_end", "billing_override",
        "payment_marked_received", "super_admin_created", "gym_deleted",
        "settings_updated", "announcement_updated", "maintenance_mode_toggled",
        name="auditaction"
    )
    # For PostgreSQL, we explicitly create the type if it doesn't exist
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        audit_action.create(conn, checkfirst=True)

    # 2. Alter audit_logs.action column to use the enum
    # On PostgreSQL, we need a USING clause to cast existing strings to the new type
    if conn.dialect.name == "postgresql":
        op.execute("ALTER TABLE audit_logs ALTER COLUMN action TYPE auditaction USING action::auditaction")
    else:
        # SQLite fallback: no-op since it doesn't have custom enum types
        pass


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        op.execute("ALTER TABLE audit_logs ALTER COLUMN action TYPE VARCHAR(50)")
        sa.Enum(name="auditaction").drop(conn, checkfirst=True)
    else:
        pass
