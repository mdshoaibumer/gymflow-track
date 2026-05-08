import uuid
from datetime import date
from enum import Enum as PyEnum

from sqlalchemy import String, ForeignKey, Enum, Date, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class MembershipStatus(str, PyEnum):
    ACTIVE = "active"
    EXPIRED = "expired"
    FROZEN = "frozen"


class Gender(str, PyEnum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class Member(BaseModel):
    __tablename__ = "members"

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(15), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gender: Mapped[Gender | None] = mapped_column(Enum(Gender), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    emergency_contact: Mapped[str | None] = mapped_column(String(15), nullable=True)

    # Membership
    membership_status: Mapped[MembershipStatus] = mapped_column(
        Enum(MembershipStatus), default=MembershipStatus.ACTIVE, nullable=False
    )
    membership_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    membership_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    membership_plan: Mapped[str | None] = mapped_column(String(100), nullable=True)
    amount_paid: Mapped[int] = mapped_column(Integer, default=0)  # in paise (INR * 100)

    # Relationships
    gym = relationship("Gym", back_populates="members")
