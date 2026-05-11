"""initial schema

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-05-08

Creates the foundational tables for GymFlow Track multi-tenant SaaS:
- gyms: tenant table
- users: gym staff/owners (scoped to gym)
- members: gym members (scoped to gym)

Includes:
- UUID primary keys
- Timezone-aware timestamps
- Foreign keys with cascading
- Composite unique constraints for multi-tenant safety
- Indexes for common query patterns
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # === GYMS TABLE ===
    op.create_table(
        "gyms",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("phone", sa.String(15), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # === USERS TABLE ===
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "gym_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("gyms.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, index=True),
        sa.Column("phone", sa.String(15), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("owner", "admin", "staff", name="userrole"),
            nullable=False,
            server_default="owner",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        # Multi-tenant constraint: same email can exist in different gyms,
        # but NOT within the same gym.
        sa.UniqueConstraint("gym_id", "email", name="uq_users_gym_email"),
    )

    # === MEMBERS TABLE ===
    op.create_table(
        "members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "gym_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("gyms.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(15), nullable=False, index=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column(
            "gender",
            sa.Enum("male", "female", "other", name="gender"),
            nullable=True,
        ),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("emergency_contact", sa.String(15), nullable=True),
        sa.Column(
            "membership_status",
            sa.Enum("active", "expired", "frozen", "pending", "cancelled", name="membershipstatus"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("membership_start", sa.Date(), nullable=True),
        sa.Column("membership_end", sa.Date(), nullable=True),
        sa.Column("membership_plan", sa.String(100), nullable=True),
        sa.Column("amount_paid", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        # Multi-tenant constraint: same phone can exist in different gyms,
        # but NOT within the same gym (phone is the primary member identifier).
        sa.UniqueConstraint("gym_id", "phone", name="uq_members_gym_phone"),
    )


def downgrade() -> None:
    op.drop_table("members")
    op.drop_table("users")
    op.drop_table("gyms")
    # Clean up enum types
    sa.Enum(name="membershipstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="gender").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="userrole").drop(op.get_bind(), checkfirst=True)
