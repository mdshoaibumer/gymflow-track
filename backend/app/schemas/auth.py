from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import UserRole
from app.schemas.sanitize import strip_html_tags
from app.schemas.validators import validate_password_strength


def _validate_password_strength(password: str) -> str:
    """Delegate to shared validator. Kept for backward compatibility."""
    return validate_password_strength(password)


class GymRegisterRequest(BaseModel):
    """Used during initial gym signup."""

    gym_name: str = Field(..., min_length=2, max_length=200)
    owner_name: str = Field(..., min_length=2, max_length=200)
    phone: str = Field(..., pattern=r"^[6-9]\d{9}$")  # Indian mobile
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    city: str | None = None

    @field_validator("gym_name", "owner_name", "city")
    @classmethod
    def sanitize_text_fields(cls, v: str | None) -> str | None:
        return strip_html_tags(v) if v else v

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


class LogoutRequest(BaseModel):
    """Optional: specific refresh token to revoke. If omitted, revokes all."""
    refresh_token: str | None = None


class ForgotPasswordRequest(BaseModel):
    """Initiate password reset — sends token via email/SMS."""
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str


class ResetPasswordRequest(BaseModel):
    """Complete password reset using the token from email/SMS."""
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class ResetPasswordResponse(BaseModel):
    message: str


class CurrentUserResponse(BaseModel):
    """
    Safe user profile response — excludes password_hash and internal fields.

    Why this exists:
    - Frontend needs user identity after page reload (token is opaque)
    - Validates the token is still valid server-side (user active, not deleted)
    - Returns gym context for multi-tenant UI rendering
    """

    id: UUID
    gym_id: UUID | None
    name: str
    email: str
    phone: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}
