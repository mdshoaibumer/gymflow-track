"""
Gym Membership Plan model.

Stores the membership plans that a gym offers to its members.
Each gym can define their own plans with custom names, durations, and pricing.
This replaces the previous frontend-only localStorage approach so plans
are persistent, shared across devices, and accessible to all staff.
"""

import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class GymMembershipPlan(BaseModel):
    __tablename__ = "gym_membership_plans"
    __table_args__ = (
        # Quick lookup: all plans for a gym
        Index("ix_gym_membership_plans_gym_id", "gym_id"),
        # Prevent duplicate plan names within a gym
        Index(
            "uq_gym_membership_plans_gym_name",
            "gym_id",
            "name",
            unique=True,
            postgresql_where="is_active = true",
        ),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_months: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # in rupees (not paise — matches frontend display)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)

    # Relationships
    gym = relationship("Gym", back_populates="membership_plans")
