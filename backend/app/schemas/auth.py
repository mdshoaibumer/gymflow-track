import re
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.config import settings
from app.models.user import UserRole


def _validate_password_strength(password: str) -> str:
    """
    Enforce password policy. Rules:
    - Length: configurable min/max (default 8-128)
    - Must contain: 1 uppercase, 1 lowercase, 1 digit
    - No specific special char requirement (reduces user friction)

    Why these rules:
    - Prevents trivially weak passwords (e.g., "password", "12345678")
    - Uppercase+lowercase+digit covers NIST "moderate" complexity
    - No special char requirement: NIST 800-63B recommends length over complexity
    - Max 128 chars: prevents bcrypt DoS (bcrypt truncates at 72 bytes anyway)
    """
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters")
    if len(password) > settings.PASSWORD_MAX_LENGTH:
        raise ValueError(f"Password must be at most {settings.PASSWORD_MAX_LENGTH} characters")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one digit")
    return password


class GymRegisterRequest(BaseModel):
    """Used during initial gym signup."""

    gym_name: str = Field(..., min_length=2, max_length=200)
    owner_name: str = Field(..., min_length=2, max_length=200)
    phone: str = Field(..., pattern=r"^[6-9]\d{9}$")  # Indian mobile
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    city: str | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class CurrentUserResponse(BaseModel):
    """
    Safe user profile response — excludes password_hash and internal fields.

    Why this exists:
    - Frontend needs user identity after page reload (token is opaque)
    - Validates the token is still valid server-side (user active, not deleted)
    - Returns gym context for multi-tenant UI rendering
    """

    id: UUID
    gym_id: UUID
    name: str
    email: str
    phone: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}
