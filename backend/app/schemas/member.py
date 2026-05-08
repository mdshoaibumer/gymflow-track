from datetime import date
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.member import Gender, MembershipStatus


class MemberCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    phone: str = Field(..., pattern=r"^[6-9]\d{9}$")
    email: EmailStr | None = None
    gender: Gender | None = None
    date_of_birth: date | None = None
    emergency_contact: str | None = None
    membership_plan: str | None = None
    membership_start: date | None = None
    membership_end: date | None = None
    amount_paid: int = 0  # in paise


class MemberUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    phone: str | None = Field(None, pattern=r"^[6-9]\d{9}$")
    email: EmailStr | None = None
    gender: Gender | None = None
    membership_status: MembershipStatus | None = None
    membership_plan: str | None = None
    membership_start: date | None = None
    membership_end: date | None = None
    amount_paid: int | None = None


class MemberResponse(BaseModel):
    id: UUID
    name: str
    phone: str
    email: str | None
    gender: Gender | None
    membership_status: MembershipStatus
    membership_plan: str | None
    membership_start: date | None
    membership_end: date | None
    amount_paid: int

    model_config = {"from_attributes": True}


class MemberListResponse(BaseModel):
    members: list[MemberResponse]
    total: int
