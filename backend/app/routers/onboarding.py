"""
Onboarding + pilot operations API.

Endpoints:
- GET /onboarding/status — setup wizard progress
- POST /onboarding/demo-data — seed demo data
- POST /onboarding/import/detect — upload CSV, auto-detect column mappings
- POST /onboarding/import/preview — preview with confirmed mappings
- POST /onboarding/import/upload — one-shot import with optional mapping overrides
- POST /feedback — submit in-app feedback
- GET /admin/metrics — internal pilot metrics (owner only)
- PUT /admin/gyms/{id}/suspend — suspend a gym (internal)

CSV Import Flow (recommended):
1. POST /import/detect — Upload file, get auto-detected column mappings
2. Frontend shows mapping UI with dropdowns for unmapped/low-confidence columns
3. POST /import/preview — Re-upload with user-confirmed mappings, get row preview
4. POST /import/upload — Final import with confirmed mappings
"""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_admin, require_owner
from app.core.exceptions import ValidationError
from app.models.member import Member
from app.schemas.onboarding import (
    ColumnDetectResponse,
    DemoDataRequest,
    DemoDataResponse,
    FeedbackRequest,
    FeedbackResponse,
    ImportPreviewResponse,
    ImportResultResponse,
    ImportWithMappingRequest,
    OnboardingStatusResponse,
)
from app.services.onboarding_service import (
    commit_csv_import,
    create_feedback,
    detect_csv_columns,
    get_onboarding_status,
    parse_csv_with_mapping,
    seed_demo_data,
    get_pilot_metrics,
)

logger = logging.getLogger("gymflow.onboarding")

router = APIRouter()


def _parse_column_overrides(column_overrides: str | None) -> dict[str, str | None] | None:
    """Parse column_overrides JSON query param into a dict."""
    if not column_overrides:
        return None
    try:
        override_list = json.loads(column_overrides)
        return {
            item["target_field"]: item.get("csv_column")
            for item in override_list
        }
    except (json.JSONDecodeError, KeyError, TypeError):
        raise ValidationError("Invalid column_overrides format")


async def _get_existing_phones(db: AsyncSession, gym_id: UUID) -> set[str]:
    """Fetch existing member phone numbers for duplicate detection."""
    result = await db.execute(
        select(Member.phone).where(Member.gym_id == gym_id)
    )
    return {row[0] for row in result.all()}


# === Setup Wizard ===


@router.get("/onboarding/status", response_model=OnboardingStatusResponse)
async def onboarding_status(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get onboarding progress for the setup wizard.

    Computed from actual data — no stored state needed.
    Frontend uses this to show/hide setup steps.
    """
    from app.models.gym import Gym

    gym = (await db.execute(
        select(Gym).where(Gym.id == current_user.gym_id)
    )).scalar_one_or_none()

    gym_name = gym.name if gym else "Your Gym"
    result = await get_onboarding_status(db, current_user.gym_id, gym_name)
    return result


@router.post("/onboarding/demo-data", response_model=DemoDataResponse)
async def load_demo_data(
    data: DemoDataRequest,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """
    Seed demo data for exploration. Owner only.

    Creates realistic Indian gym data: members with varied statuses,
    payments, and common equipment. Safe to run on a fresh gym.
    """
    result = await seed_demo_data(
        db,
        current_user.gym_id,
        include_members=data.include_members,
        include_payments=data.include_payments,
        include_equipment=data.include_equipment,
        member_count=data.member_count,
    )
    return result


# === CSV Import ===


async def _read_csv_upload(file: UploadFile) -> str:
    """Validate and read a CSV upload. Returns CSV text content."""
    from app.core.exceptions import ValidationError

    if not file.filename:
        raise ValidationError("No file uploaded")

    # Accept .csv and .txt (some users save CSV as .txt)
    allowed_extensions = (".csv", ".txt")
    if not any(file.filename.lower().endswith(ext) for ext in allowed_extensions):
        raise ValidationError("Please upload a CSV file (.csv)")

    content = await file.read()
    if len(content) > 1_048_576:  # 1MB
        raise ValidationError("File too large (max 1MB)")

    if len(content) == 0:
        raise ValidationError("File is empty")

    # Try UTF-8 first, then Latin-1 (covers most Indian locale exports)
    try:
        return content.decode("utf-8-sig")  # utf-8-sig handles BOM from Excel
    except UnicodeDecodeError:
        try:
            return content.decode("latin-1")
        except UnicodeDecodeError:
            raise ValidationError("Unable to read file. Please save as UTF-8 CSV.")


@router.post("/onboarding/import/detect", response_model=ColumnDetectResponse)
async def import_detect_columns(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 1: Upload CSV and auto-detect column mappings.

    Returns:
    - mappings: auto-detected field→column assignments with confidence scores
    - unmapped_columns: CSV columns we couldn't identify
    - missing_required: required fields (name, phone) not found
    - sample_data: first 3 rows for the user to verify
    - target_fields: all available fields with labels (for dropdown UI)

    Frontend should show a mapping UI:
    ┌─────────────────┬──────────────────┬────────────┐
    │ Our Field       │ Your Column      │ Confidence │
    ├─────────────────┼──────────────────┼────────────┤
    │ Member Name *   │ [Member Name ▼]  │ ✅ 100%    │
    │ Phone *         │ [WhatsApp No ▼]  │ ✅ 100%    │
    │ Email           │ [— none — ▼]     │            │
    │ Plan            │ [Package ▼]      │ ⚠️ 70%     │
    │ Gender          │ [M/F ▼]          │ ⚠️ 50%     │
    └─────────────────┴──────────────────┴────────────┘
    """
    csv_text = await _read_csv_upload(file)
    result = detect_csv_columns(csv_text)
    return result


@router.post("/onboarding/import/preview", response_model=ImportPreviewResponse)
async def import_preview(
    file: UploadFile = File(...),
    column_overrides: str | None = Query(
        None,
        description='JSON string of column overrides: [{"target_field":"name","csv_column":"Full Name"}]',
    ),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 2: Upload CSV with confirmed column mappings and preview rows.

    Accepts optional column_overrides (JSON query param) to fix any
    auto-detection mistakes. If not provided, uses auto-detected mappings.

    Returns per-row validation: valid, duplicate, or invalid with error details.
    """
    csv_text = await _read_csv_upload(file)

    overrides_dict = _parse_column_overrides(column_overrides)
    existing_phones = await _get_existing_phones(db, current_user.gym_id)

    preview = parse_csv_with_mapping(
        csv_text, current_user.gym_id, existing_phones, overrides_dict
    )
    return preview


@router.post("/onboarding/import/upload", response_model=ImportResultResponse)
async def import_upload(
    file: UploadFile = File(...),
    skip_duplicates: bool = Query(True),
    skip_invalid: bool = Query(True),
    column_overrides: str | None = Query(
        None,
        description='JSON string of column overrides: [{"target_field":"name","csv_column":"Full Name"}]',
    ),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    One-shot CSV import: detect columns + parse + commit.

    Accepts optional column_overrides for user-corrected mappings.
    Without overrides, uses auto-detected column mappings.
    """
    csv_text = await _read_csv_upload(file)

    overrides_dict = _parse_column_overrides(column_overrides)
    existing_phones = await _get_existing_phones(db, current_user.gym_id)

    preview = parse_csv_with_mapping(
        csv_text, current_user.gym_id, existing_phones, overrides_dict
    )
    import_result = await commit_csv_import(
        db, current_user.gym_id, preview["rows"],
        skip_duplicates=skip_duplicates,
        skip_invalid=skip_invalid,
    )
    return import_result


# === Feedback ===


@router.post("/feedback", response_model=FeedbackResponse, status_code=201)
async def submit_feedback(
    data: FeedbackRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit in-app feedback. Any authenticated user.

    Categories:
    - bug: Something is broken
    - feature: I wish it could do X
    - friction: This is confusing / hard to use
    - general: Other feedback
    """
    fb = await create_feedback(
        db,
        gym_id=current_user.gym_id,
        user_id=current_user.user_id,
        category=data.category,
        message=data.message,
        page=data.page,
    )
    return FeedbackResponse(
        id=str(fb.id),
        category=fb.category.value,
        message=fb.message,
        created_at=fb.created_at.isoformat() if fb.created_at else "",
    )


# === Internal Pilot Metrics ===


@router.get("/admin/metrics")
async def pilot_metrics(
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """
    Internal operational metrics for pilot monitoring.

    Owner-only. Shows gym-level usage for the current gym.
    NOT a cross-gym admin panel — that comes later.
    """
    return await get_pilot_metrics(db, current_user.gym_id)
