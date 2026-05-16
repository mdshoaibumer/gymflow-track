import uuid
from datetime import date
from enum import Enum as PyEnum

from sqlalchemy import String, ForeignKey, Date, Integer, Boolean, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, PgEnum


class MembershipStatus(str, PyEnum):
    ACTIVE = "active"
    EXPIRED = "expired"
    FROZEN = "frozen"
    PENDING = "pending"
    CANCELLED = "cancelled"


class Gender(str, PyEnum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class Batch(str, PyEnum):
    MORNING = "morning"
    EVENING = "evening"
    AFTERNOON = "afternoon"


class Member(BaseModel):
    __tablename__ = "members"
    __table_args__ = (
        # Phone uniqueness enforced via partial unique index in migration 011
        # (excludes soft-deleted rows so phone numbers can be reused).
        # Dashboard query: count by status
        Index("ix_members_gym_status", "gym_id", "membership_status"),
        # Expiry queries: members expiring within N days
        Index("ix_members_gym_end", "gym_id", "membership_end"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(15), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gender: Mapped[Gender | None] = mapped_column(
        PgEnum(Gender, name="gender"), nullable=True
    )
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    father_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    batch: Mapped[Batch | None] = mapped_column(
        PgEnum(Batch, name="batch"), nullable=True
    )
    emergency_contact: Mapped[str | None] = mapped_column(String(15), nullable=True)

    # Membership
    membership_status: Mapped[MembershipStatus] = mapped_column(
        PgEnum(MembershipStatus, name="membershipstatus"),
        default=MembershipStatus.ACTIVE,
        nullable=False,
    )
    membership_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    membership_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    membership_plan: Mapped[str | None] = mapped_column(String(100), nullable=True)
    amount_paid: Mapped[int] = mapped_column(Integer, default=0)  # in paise (INR * 100)

    # Member photo — relative path under uploads/ (e.g. "members/{gym_id}/{member_id}.jpg")
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Custom fields — owner-defined dynamic fields stored as JSON
    # e.g. {"blood_group": "A+", "address": "123 Main St", "height_cm": 175}
    custom_fields: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)

    # Optimistic locking: version counter incremented on every update.
    # Prevents silent data loss when two users edit the same member concurrently.
    version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    # Soft-delete flag
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)

    # Relationships
    gym = relationship("Gym", back_populates="members")
