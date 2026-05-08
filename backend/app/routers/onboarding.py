"""
Onboarding + pilot operations API.

Endpoints:
- GET /onboarding/status — setup wizard progress
- POST /onboarding/demo-data — seed demo data
- POST /onboarding/import/preview — CSV import preview
- POST /onboarding/import/commit — commit the import
- POST /feedback — submit in-app feedback
- GET /admin/metrics — internal pilot metrics (owner only)
- PUT /admin/gyms/{id}/suspend — suspend a gym (internal)
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_admin, require_owner
from app.schemas.onboarding import (
    DemoDataRequest,
    DemoDataResponse,
    FeedbackRequest,
    FeedbackResponse,
    ImportCommitRequest,
    ImportPreviewResponse,
    ImportResultResponse,
    OnboardingStatusResponse,
)
from app.services.onboarding_service import (
    commit_csv_import,
    create_feedback,
    get_onboarding_status,
    parse_csv_preview,
    seed_demo_data,
)

logger = logging.getLogger("gymflow.onboarding")

router = APIRouter()


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


@router.post("/onboarding/import/preview", response_model=ImportPreviewResponse)
async def import_preview(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a CSV and preview what will be imported.

    Step 1 of 2-phase import. Returns validation results:
    - Which rows are valid
    - Which are duplicates (phone already exists)
    - Which have errors

    Max file size: 1MB. Max rows: 500.
    """
    if not file.filename or not file.filename.endswith(".csv"):
        from app.core.exceptions import ValidationError
        raise ValidationError("Please upload a CSV file")

    content = await file.read()
    if len(content) > 1_048_576:  # 1MB
        from app.core.exceptions import ValidationError
        raise ValidationError("File too large (max 1MB)")

    try:
        csv_text = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            csv_text = content.decode("latin-1")
        except UnicodeDecodeError:
            from app.core.exceptions import ValidationError
            raise ValidationError("Unable to read file. Please save as UTF-8 CSV.")

    # Get existing phones for duplicate detection
    from app.models.member import Member
    result = await db.execute(
        select(Member.phone).where(Member.gym_id == current_user.gym_id)
    )
    existing_phones = {row[0] for row in result.all()}

    preview = parse_csv_preview(csv_text, current_user.gym_id, existing_phones)
    return preview


@router.post("/onboarding/import/commit", response_model=ImportResultResponse)
async def import_commit(
    data: ImportCommitRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Commit a previously previewed import.

    The frontend must re-send the rows from the preview response.
    This endpoint re-validates and imports valid rows.

    Note: In a real 2-phase import, you'd cache the preview server-side.
    For MVP simplicity, the frontend holds the preview data and re-sends it.
    This works fine for <500 member imports.
    """
    # For MVP simplicity, the /import/upload endpoint handles both parse+commit.
    # This endpoint is kept for API completeness but redirects to the upload flow.
    from app.core.exceptions import ValidationError
    raise ValidationError("Use /onboarding/import/upload for one-step CSV import")


@router.post("/onboarding/import/upload", response_model=ImportResultResponse)
async def import_upload(
    file: UploadFile = File(...),
    skip_duplicates: bool = Query(True),
    skip_invalid: bool = Query(True),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    One-shot CSV import: parse + commit in a single request.

    For pilot simplicity — upload CSV, import valid rows, skip bad ones.
    Returns a summary of what was imported.
    """
    if not file.filename or not file.filename.endswith(".csv"):
        from app.core.exceptions import ValidationError
        raise ValidationError("Please upload a CSV file")

    content = await file.read()
    if len(content) > 1_048_576:
        from app.core.exceptions import ValidationError
        raise ValidationError("File too large (max 1MB)")

    try:
        csv_text = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            csv_text = content.decode("latin-1")
        except UnicodeDecodeError:
            from app.core.exceptions import ValidationError
            raise ValidationError("Unable to read file. Please save as UTF-8 CSV.")

    from app.models.member import Member
    result = await db.execute(
        select(Member.phone).where(Member.gym_id == current_user.gym_id)
    )
    existing_phones = {row[0] for row in result.all()}

    preview = parse_csv_preview(csv_text, current_user.gym_id, existing_phones)
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
    from app.models.member import Member
    from app.models.payment import Payment
    from app.models.attendance import Attendance
    from app.models.notification import Notification
    from app.models.asset import Asset
    from app.models.feedback import Feedback as FeedbackModel
    from datetime import datetime, timezone

    gym_id = current_user.gym_id
    today = datetime.now(timezone.utc).date()
    week_ago = today - __import__("datetime").timedelta(days=7)

    # Members
    total_members = (await db.execute(
        select(func.count()).select_from(Member).where(Member.gym_id == gym_id)
    )).scalar_one()

    active_members = (await db.execute(
        select(func.count()).select_from(Member).where(
            Member.gym_id == gym_id,
            Member.membership_status == "active",
        )
    )).scalar_one()

    # Members added this week
    from app.models.base import BaseModel as BM
    members_this_week = (await db.execute(
        select(func.count()).select_from(Member).where(
            Member.gym_id == gym_id,
            Member.created_at >= str(week_ago),
        )
    )).scalar_one()

    # Payments this month
    month_start = today.replace(day=1)
    payments_this_month = (await db.execute(
        select(func.count()).select_from(Payment).where(
            Payment.gym_id == gym_id,
            Payment.created_at >= str(month_start),
        )
    )).scalar_one()

    # Attendance today
    attendance_today = (await db.execute(
        select(func.count()).select_from(Attendance).where(
            Attendance.gym_id == gym_id,
            Attendance.check_in_date == today,
        )
    )).scalar_one()

    # Attendance this week
    attendance_week = (await db.execute(
        select(func.count()).select_from(Attendance).where(
            Attendance.gym_id == gym_id,
            Attendance.check_in_date >= week_ago,
        )
    )).scalar_one()

    # Notifications
    from app.models.notification import NotificationStatus
    notifications_sent = (await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.gym_id == gym_id,
            Notification.status == NotificationStatus.SENT,
        )
    )).scalar_one()

    notifications_failed = (await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.gym_id == gym_id,
            Notification.status == NotificationStatus.FAILED,
        )
    )).scalar_one()

    # Equipment
    equipment_count = (await db.execute(
        select(func.count()).select_from(Asset).where(Asset.gym_id == gym_id)
    )).scalar_one()

    # Feedback count
    feedback_count = (await db.execute(
        select(func.count()).select_from(FeedbackModel).where(FeedbackModel.gym_id == gym_id)
    )).scalar_one()

    return {
        "total_members": total_members,
        "active_members": active_members,
        "members_added_this_week": members_this_week,
        "payments_this_month": payments_this_month,
        "attendance_today": attendance_today,
        "attendance_this_week": attendance_week,
        "notifications_sent": notifications_sent,
        "notifications_failed": notifications_failed,
        "equipment_count": equipment_count,
        "feedback_count": feedback_count,
    }
