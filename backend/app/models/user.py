import uuid
from enum import Enum as PyEnum

from sqlalchemy import String, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, PgEnum


class UserRole(str, PyEnum):
    OWNER = "owner"
    ADMIN = "admin"
    STAFF = "staff"


class User(BaseModel):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("gym_id", "email", name="uq_users_gym_email"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(15), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        PgEnum(UserRole, name="userrole"), default=UserRole.OWNER, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    gym = relationship("Gym", back_populates="users")
