"""Add biometric attendance tables and enum value

Revision ID: 031_biometric_attendance
Revises: 030_expenses
Create Date: 2026-06-05

Adds:
- 'biometric' value to the checkinsource PostgreSQL enum
- 'biometrictype' enum (fingerprint, face)
- 'devicestatus' enum (active, inactive, revoked)
- 'biometric_devices' table for registered devices
- 'biometric_templates' table for encrypted member templates
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = "031_biometric_attendance"
down_revision = "030_expenses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add 'biometric' to checkinsource enum
    op.execute("ALTER TYPE checkinsource ADD VALUE IF NOT EXISTS 'biometric'")

    # 2. Create new enum types
    op.execute("CREATE TYPE IF NOT EXISTS biometrictype AS ENUM ('fingerprint', 'face')")
    op.execute("CREATE TYPE IF NOT EXISTS devicestatus AS ENUM ('active', 'inactive', 'revoked')")

    # 3. Create biometric_devices table
    op.create_table(
        "biometric_devices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("gym_id", UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_name", sa.String(100), nullable=False),
        sa.Column("device_model", sa.String(100), nullable=True),
        sa.Column("serial_number", sa.String(100), nullable=True),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("api_key_hash", sa.String(128), nullable=False),
        sa.Column("api_key_prefix", sa.String(12), nullable=False),
        sa.Column(
            "biometric_type",
            sa.Enum("fingerprint", "face", name="biometrictype", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("active", "inactive", "revoked", name="devicestatus", create_type=False),
            nullable=False,
            server_default="active",
        ),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("min_match_score", sa.Float, nullable=False, server_default="0.80"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index(
        "ix_biometric_devices_gym_status",
        "biometric_devices",
        ["gym_id", "status"],
    )

    # 4. Create biometric_templates table
    op.create_table(
        "biometric_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("gym_id", UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", UUID(as_uuid=True), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id", UUID(as_uuid=True), sa.ForeignKey("biometric_devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("template_data", sa.LargeBinary, nullable=False),
        sa.Column("encryption_iv", sa.LargeBinary, nullable=False),
        sa.Column(
            "biometric_type",
            sa.Enum("fingerprint", "face", name="biometrictype", create_type=False),
            nullable=False,
        ),
        sa.Column("quality_score", sa.Float, nullable=True),
        sa.Column("template_format", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index(
        "ix_biometric_templates_member_active",
        "biometric_templates",
        ["member_id", "is_active"],
    )
    op.create_index(
        "ix_biometric_templates_gym_type",
        "biometric_templates",
        ["gym_id", "biometric_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_biometric_templates_gym_type", table_name="biometric_templates")
    op.drop_index("ix_biometric_templates_member_active", table_name="biometric_templates")
    op.drop_table("biometric_templates")

    op.drop_index("ix_biometric_devices_gym_status", table_name="biometric_devices")
    op.drop_table("biometric_devices")

    op.execute("DROP TYPE IF EXISTS devicestatus")
    op.execute("DROP TYPE IF EXISTS biometrictype")

    # Note: Cannot remove 'biometric' from checkinsource enum in PostgreSQL.
    # The value is harmless if unused.
