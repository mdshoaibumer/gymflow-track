"""add assets and maintenance_records tables

Revision ID: 005_assets
Revises: 004_attendance
Create Date: 2026-05-09

Adds:
- assets table for gym equipment tracking
- maintenance_records table for service history
- Enum types for asset_status, asset_category, maintenance_type
- Unique constraint on (gym_id, asset_code)
- Indexes for status queries, per-asset history, upcoming maintenance
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "005_assets"
down_revision = "004_attendance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types
    asset_status = postgresql.ENUM(
        "active", "under_maintenance", "out_of_service", "retired",
        name="assetstatus", create_type=True,
    )
    asset_category = postgresql.ENUM(
        "cardio", "strength", "free_weights", "functional",
        "accessories", "facility", "other",
        name="assetcategory", create_type=True,
    )
    maintenance_type = postgresql.ENUM(
        "preventive", "corrective", "inspection", "warranty",
        name="maintenancetype", create_type=True,
    )
    asset_status.create(op.get_bind(), checkfirst=True)
    asset_category.create(op.get_bind(), checkfirst=True)
    maintenance_type.create(op.get_bind(), checkfirst=True)

    # Assets table
    op.create_table(
        "assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("asset_code", sa.String(50), nullable=False),
        sa.Column("category", asset_category, nullable=False),
        sa.Column("manufacturer", sa.String(200), nullable=True),
        sa.Column("serial_number", sa.String(200), nullable=True),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("purchase_cost_in_paise", sa.Integer(), nullable=True),
        sa.Column("warranty_expiry", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", asset_status, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("gym_id", "asset_code", name="uq_assets_gym_code"),
    )
    op.create_index("ix_assets_gym_id", "assets", ["gym_id"])
    op.create_index("ix_assets_gym_status", "assets", ["gym_id", "status"])

    # Maintenance records table
    op.create_table(
        "maintenance_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("maintenance_type", maintenance_type, nullable=False),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("next_service_date", sa.Date(), nullable=True),
        sa.Column("cost_in_paise", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("vendor_name", sa.String(200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("performed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_maintenance_gym_id", "maintenance_records", ["gym_id"])
    op.create_index("ix_maintenance_asset_id", "maintenance_records", ["asset_id"])
    op.create_index("ix_maintenance_asset_date", "maintenance_records", ["asset_id", "service_date"])
    op.create_index("ix_maintenance_gym_next", "maintenance_records", ["gym_id", "next_service_date"])


def downgrade() -> None:
    op.drop_table("maintenance_records")
    op.drop_table("assets")
    op.execute("DROP TYPE IF EXISTS maintenancetype")
    op.execute("DROP TYPE IF EXISTS assetcategory")
    op.execute("DROP TYPE IF EXISTS assetstatus")
