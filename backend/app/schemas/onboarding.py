"""
Onboarding schemas — setup wizard, demo data, member CSV import.
"""

from datetime import date
from pydantic import BaseModel, EmailStr, Field


class OnboardingStatusResponse(BaseModel):
    """Tracks which setup steps the gym has completed."""
    gym_name: str
    has_members: bool
    member_count: int
    has_attendance: bool
    has_payments: bool
    has_equipment: bool
    onboarding_complete: bool


class DemoDataRequest(BaseModel):
    """Request to seed demo data for exploration."""
    include_members: bool = True
    include_payments: bool = True
    include_equipment: bool = True
    member_count: int = Field(default=15, ge=5, le=50)


class DemoDataResponse(BaseModel):
    members_created: int
    payments_created: int
    equipment_created: int


# === CSV Import ===

class ImportRowPreview(BaseModel):
    """Single row in the import preview."""
    row_number: int
    name: str
    phone: str
    email: str | None = None
    membership_plan: str | None = None
    membership_start: str | None = None
    membership_end: str | None = None
    status: str  # "valid" | "duplicate" | "invalid"
    errors: list[str] = []


class ImportPreviewResponse(BaseModel):
    """Preview of CSV parsing before committing."""
    total_rows: int
    valid: int
    duplicates: int
    invalid: int
    rows: list[ImportRowPreview]


class ImportCommitRequest(BaseModel):
    """Commit the previewed import — skip duplicates and invalid rows."""
    skip_duplicates: bool = True
    skip_invalid: bool = True


class ImportResultResponse(BaseModel):
    """Result after committing an import."""
    imported: int
    skipped_duplicates: int
    skipped_invalid: int
    errors: list[str] = []


# === Feedback ===

class FeedbackRequest(BaseModel):
    """Lightweight in-app feedback."""
    category: str = Field(..., pattern=r"^(bug|feature|friction|general)$")
    message: str = Field(..., min_length=5, max_length=2000)
    page: str | None = Field(None, max_length=200)  # Which page they were on


class FeedbackResponse(BaseModel):
    id: str
    category: str
    message: str
    created_at: str
