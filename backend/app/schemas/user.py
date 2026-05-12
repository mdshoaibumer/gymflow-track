"""Schemas for user/staff management."""

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import UserRole
from app.schemas.validators import validate_password_strength


def _validate_password_strength(password: str) -> str:
    """Delegate to shared validator. Kept for backward compatibility."""
    return validate_password_strength(password)


class CreateUserRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    email: EmailStr
    phone: str = Field(..., pattern=r"^[6-9]\d{9}$")
    password: str = Field(..., min_length=8, max_length=128)
    role: UserRole = Field(default=UserRole.STAFF)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)

    @field_validator("role")
    @classmethod
    def prevent_owner_creation(cls, v: UserRole) -> UserRole:
        if v == UserRole.OWNER:
            raise ValueError("Cannot create users with OWNER role")
        return v


class UpdateUserRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    phone: str | None = Field(None, pattern=r"^[6-9]\d{9}$")
    role: UserRole | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def prevent_owner_role(cls, v: UserRole | None) -> UserRole | None:
        if v == UserRole.OWNER:
            raise ValueError("Cannot assign OWNER role")
        return v


class UserResponse(BaseModel):
    id: UUID
    gym_id: UUID
    name: str
    email: str
    phone: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}
