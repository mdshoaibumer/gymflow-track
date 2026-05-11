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
    include_attendance: bool = True
    include_feedback: bool = True
    member_count: int = Field(default=25, ge=5, le=50)


class DemoDataResponse(BaseModel):
    members_created: int
    payments_created: int
    equipment_created: int
    attendance_created: int
    feedback_created: int


# === CSV Import — Column Mapping ===


class DetectedColumnMapping(BaseModel):
    """A single auto-detected column mapping."""
    csv_column: str
    target_field: str
    confidence: float = Field(ge=0.0, le=1.0)
    match_method: str  # "exact" | "keyword" | "content" | "manual"


class ColumnDetectResponse(BaseModel):
    """
    Result of column auto-detection (Step 1).

    Frontend shows this to the user with dropdowns to override mappings.
    """
    mappings: list[DetectedColumnMapping]
    unmapped_columns: list[str]
    missing_required: list[str]
    all_csv_columns: list[str]
    sample_data: list[dict[str, str]]
    target_fields: list[dict[str, str]]  # [{field, label, required}, ...]


class ColumnOverride(BaseModel):
    """User override for a single column mapping."""
    target_field: str
    csv_column: str | None = None  # None = "skip this field"


class ImportWithMappingRequest(BaseModel):
    """
    Request to preview or import with user-confirmed column mappings.

    column_overrides: Only needed if the user changed auto-detected mappings.
    If empty, auto-detected mappings are used as-is.
    """
    column_overrides: list[ColumnOverride] = []
    skip_duplicates: bool = True
    skip_invalid: bool = True


# === CSV Import — Row Preview ===


class ImportRowPreview(BaseModel):
    """Single row in the import preview."""
    row_number: int
    name: str
    phone: str
    email: str | None = None
    gender: str | None = None
    membership_plan: str | None = None
    membership_start: str | None = None
    membership_end: str | None = None
    amount_paid: int | None = None  # in paise
    status: str  # "valid" | "duplicate" | "invalid"
    errors: list[str] = []


class ImportPreviewResponse(BaseModel):
    """Preview of CSV parsing before committing."""
    total_rows: int
    valid: int
    duplicates: int
    invalid: int
    column_mappings: list[DetectedColumnMapping]
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
