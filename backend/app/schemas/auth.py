from pydantic import BaseModel, EmailStr, Field


class GymRegisterRequest(BaseModel):
    """Used during initial gym signup."""

    gym_name: str = Field(..., min_length=2, max_length=200)
    owner_name: str = Field(..., min_length=2, max_length=200)
    phone: str = Field(..., pattern=r"^[6-9]\d{9}$")  # Indian mobile
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    city: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str
