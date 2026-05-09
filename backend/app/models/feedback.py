"""
Feedback model — lightweight in-app feedback collection for pilot phase.

Why a DB table instead of Google Forms / Typeform:
- Context is automatic: we know which gym, which user, which page
- No external dependency to configure per pilot gym
- Can be queried programmatically for internal analytics
- Data stays in our system (no GDPR concern with third parties)

Lifecycle:
- Created by users via POST /api/v1/feedback
- Read by internal admin tooling
- No update/delete needed (append-only)
"""

import uuid
from enum import Enum as PyEnum

from sqlalchemy import String, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, PgEnum


class FeedbackCategory(str, PyEnum):
    BUG = "bug"
    FEATURE = "feature"
    FRICTION = "friction"
    GENERAL = "general"


class Feedback(BaseModel):
    __tablename__ = "feedback"

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[FeedbackCategory] = mapped_column(
        PgEnum(FeedbackCategory, name="feedbackcategory"), nullable=False
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    page: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Relationships
    gym = relationship("Gym")
    user = relationship("User")
