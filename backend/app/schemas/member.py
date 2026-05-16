from datetime import date, datetime
from uuid import UUID
import re

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.member import Batch, Gender, MembershipStatus
from app.schemas.sanitize import strip_html_tags


def normalize_phone(raw: str) -> str:
    """Normalize Indian phone numbers to canonical 10-digit format.

    Accepts common user input variations:
      +91 9876543210 → 9876543210
      091-9876543210 → 9876543210
      (0)9876543210  → 9876543210

    Strips +91 prefix, leading 0, spaces, dashes, and parentheses.
    Validation (must start with 6-9) is done after normalization.
    """
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits


class MemberCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    phone: str = Field(..., min_length=1)
    email: EmailStr | None = None
    gender: Gender | None = None
    date_of_birth: date | None = None
    father_name: str | None = Field(None, max_length=200)
    batch: Batch | None = None
    emergency_contact: str | None = None
    membership_plan: str | None = None
    membership_start: date | None = None
    membership_end: date | None = None
    amount_paid: int = 0  # in paise

    @field_validator("phone")
    @classmethod
    def validate_and_normalize_phone(cls, v: str) -> str:
        normalized = normalize_phone(v)
        if not re.match(r"^[6-9]\d{9}$", normalized):
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return normalized

    @field_validator("name", "father_name", "emergency_contact", "membership_plan")
    @classmethod
    def sanitize_text_fields(cls, v: str | None) -> str | None:
        return strip_html_tags(v) if v else v


class MemberUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    phone: str | None = Field(None, min_length=1)
    email: EmailStr | None = None
    gender: Gender | None = None
    father_name: str | None = Field(None, max_length=200)
    batch: Batch | None = None
    # membership_status is NOT updatable directly — use membership lifecycle APIs
    membership_plan: str | None = None
    membership_start: date | None = None
    membership_end: date | None = None
    amount_paid: int | None = None
    # Optimistic locking: client sends the version it last read.
    # Server rejects the update with 409 Conflict if another edit landed first.
    # Optional (None) for backward compatibility with older clients.
    version: int | None = None

    @field_validator("phone")
    @classmethod
    def validate_and_normalize_phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        normalized = normalize_phone(v)
        if not re.match(r"^[6-9]\d{9}$", normalized):
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return normalized

    @field_validator("name", "father_name", "membership_plan")
    @classmethod
    def sanitize_text_fields(cls, v: str | None) -> str | None:
        return strip_html_tags(v) if v else v


class MemberResponse(BaseModel):
    id: UUID
    name: str
    phone: str
    email: str | None
    gender: Gender | None
    father_name: str | None = None
    batch: Batch | None = None
    membership_status: MembershipStatus
    membership_plan: str | None
    membership_start: date | None
    membership_end: date | None
    amount_paid: int
    photo_url: str | None = None
    version: int = 0
    created_at: datetime | None = None  # Included for audit trail visibility in UI
    updated_at: datetime | None = None  # Included for audit trail visibility in UI

    model_config = {"from_attributes": True}


class MemberListResponse(BaseModel):
    members: list[MemberResponse]
    total: int
