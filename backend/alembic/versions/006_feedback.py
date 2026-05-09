"""006 feedback table

Revision ID: 006_feedback
Revises: 005_assets
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ENUM


revision = "006_feedback"
down_revision = "005_assets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum type using the safe, idempotent pattern
    # ENUM(..., create_type=False) + .create(checkfirst=True) ensures
    # the migration is re-runnable without "type already exists" errors
    feedbackcategory_enum = ENUM(
        "bug", "feature", "friction", "general",
        name="feedbackcategory",
        create_type=False,
    )
    feedbackcategory_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "feedback",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", UUID(as_uuid=True), sa.ForeignKey("gyms.id"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", feedbackcategory_enum, nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("page", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("feedback")
    op.execute("DROP TYPE IF EXISTS feedbackcategory")
