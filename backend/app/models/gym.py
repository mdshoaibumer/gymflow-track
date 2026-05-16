from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class Gym(BaseModel):
    __tablename__ = "gyms"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(15), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships — use lazy="raise" to prevent accidental N+1 queries.
    # Always load related data explicitly via joinedload/selectinload in queries.
    users = relationship("User", back_populates="gym", lazy="raise")
    members = relationship("Member", back_populates="gym", lazy="raise")
