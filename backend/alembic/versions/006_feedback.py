"""006 feedback table

Revision ID: 006_feedback
Revises: 005_assets
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "006_feedback"
down_revision = "005_assets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE feedbackcategory AS ENUM ('bug', 'feature', 'friction', 'general')")

    op.create_table(
        "feedback",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", UUID(as_uuid=True), sa.ForeignKey("gyms.id"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", sa.Enum("bug", "feature", "friction", "general", name="feedbackcategory", create_type=False), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("page", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("feedback")
    op.execute("DROP TYPE IF EXISTS feedbackcategory")
