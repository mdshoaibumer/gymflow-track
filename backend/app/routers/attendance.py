"""
Attendance API routes — QR check-in, manual attendance, history.

Operational Design:
- POST /check-in: QR-based (fast staff workflow — scan and done)
- POST /check-in/manual: Manual override (forgot QR, walk-in)
- POST /{id}/check-out: Optional departure tracking
- GET /today: Reception desk dashboard (who's here now?)
- GET /history: Date-range history with pagination
- GET /member/{id}: Individual member attendance
- GET /stats: Dashboard metrics
- GET /member/{id}/qr: Generate QR token for a member

RBAC:
- All routes require authentication (any gym role)
- Cancel requires ADMIN+
- QR generation requires ADMIN+
"""

from datetime import date, timedelta
from app.core.timezone import today_ist
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_admin
from app.core.billing_dependencies import require_qr_attendance
from app.models.attendance import Attendance
from app.repositories.attendance_repository import AttendanceRepository
from app.schemas.attendance import (
    AttendanceListResponse,
    AttendanceResponse,
    AttendanceStatsResponse,
    AttendanceTrendResponse,
    CheckInByQRRequest,
    DailyCount,
    ManualCheckInRequest,
    QRTokenResponse,
)
from app.services.attendance_service import AttendanceService

router = APIRouter()


def _to_response(attendance: Attendance) -> AttendanceResponse:
    """Convert attendance model to response, including eager-loaded member info.

    Uses inspect() to check if the 'member' relationship is loaded,
    avoiding lazy='raise' errors when the relationship wasn't
    eagerly loaded (e.g. after create without selectinload).
    """
    from sqlalchemy import inspect as sa_inspect

    member_name = None
    member_phone = None
    try:
        state = sa_inspect(attendance)
        if "member" in state.dict:
            member = attendance.member
            if member is not None:
                member_name = member.name
                member_phone = member.phone
    except Exception:
        pass

    return AttendanceResponse(
        id=attendance.id,
        gym_id=attendance.gym_id,
        member_id=attendance.member_id,
        check_in_at=attendance.check_in_at,
        check_out_at=attendance.check_out_at,
        check_in_date=attendance.check_in_date,
        status=attendance.status.value,
        source=attendance.source.value,
        recorded_by=attendance.recorded_by,
        member_name=member_name,
        member_phone=member_phone,
    )


@router.post("/check-in", response_model=AttendanceResponse)
async def check_in_by_qr(
    body: CheckInByQRRequest,
    current_user: CurrentUser = Depends(get_current_user),
    _qr: CurrentUser = Depends(require_qr_attendance),
    db: AsyncSession = Depends(get_db),
):
    """
    QR-based check-in. Staff scans member's QR code.
    Requires Pro plan or above.
    Returns existing attendance if already checked in today (idempotent).
    Rejects expired memberships and cross-gym QR codes.
    """
    service = AttendanceService(db)
    attendance = await service.check_in_by_qr(
        gym_id=current_user.gym_id,
        qr_token=body.qr_token,
        recorded_by=current_user.user_id,
    )
    return _to_response(attendance)


@router.post("/check-in/manual", response_model=AttendanceResponse)
async def check_in_manual(
    body: ManualCheckInRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Manual check-in by staff (member forgot QR or walk-in).
    Same business rules as QR check-in.
    """
    service = AttendanceService(db)
    attendance = await service.check_in_manual(
        gym_id=current_user.gym_id,
        member_id=body.member_id,
        recorded_by=current_user.user_id,
    )
    return _to_response(attendance)


@router.post("/{attendance_id}/check-out", response_model=AttendanceResponse)
async def check_out(
    attendance_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record check-out for a member. Only checked-in records can be checked out."""
    service = AttendanceService(db)
    attendance = await service.check_out(current_user.gym_id, attendance_id)
    return _to_response(attendance)


@router.post("/{attendance_id}/cancel", response_model=AttendanceResponse)
async def cancel_attendance(
    attendance_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an erroneous attendance record. ADMIN/OWNER only."""
    service = AttendanceService(db)
    attendance = await service.cancel_attendance(current_user.gym_id, attendance_id)
    return _to_response(attendance)


@router.get("/today", response_model=AttendanceListResponse)
async def get_today_attendance(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get today's attendance — the reception desk view.
    Returns members checked in today, ordered by most recent first.
    """
    today = today_ist()
    repo = AttendanceRepository(db)
    records = await repo.list_today(current_user.gym_id, today, skip, limit)
    total = await repo.count_today(current_user.gym_id, today)
    return AttendanceListResponse(
        attendance=[_to_response(r) for r in records],
        total=total,
    )


@router.get("/stats", response_model=AttendanceStatsResponse)
async def get_attendance_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Attendance metrics for dashboard cards."""
    today = today_ist()
    week_start = today - timedelta(days=today.weekday())
    repo = AttendanceRepository(db)

    checked_in_today = await repo.count_today(current_user.gym_id, today)
    currently_in = await repo.count_currently_in(current_user.gym_id, today)
    total_week = await repo.count_history(
        current_user.gym_id, start_date=week_start, end_date=today
    )
    return AttendanceStatsResponse(
        checked_in_today=checked_in_today,
        currently_in_gym=currently_in,
        total_this_week=total_week,
    )


@router.get("/trend", response_model=AttendanceTrendResponse)
async def get_attendance_trend(
    days: int = Query(14, ge=1, le=90),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Daily attendance counts for the last N days (chart data)."""
    today = today_ist()
    start = today - timedelta(days=days - 1)
    repo = AttendanceRepository(db)
    raw = await repo.count_by_date_range(current_user.gym_id, start, today)
    trend = [DailyCount(date=row[0], count=row[1]) for row in raw]
    return AttendanceTrendResponse(trend=trend)


@router.get("/history", response_model=AttendanceListResponse)
async def get_attendance_history(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get attendance history with optional date range filter."""
    repo = AttendanceRepository(db)
    records = await repo.list_history(
        current_user.gym_id, start_date, end_date, skip, limit
    )
    total = await repo.count_history(current_user.gym_id, start_date, end_date)
    return AttendanceListResponse(
        attendance=[_to_response(r) for r in records],
        total=total,
    )


@router.get("/member/{member_id}", response_model=AttendanceListResponse)
async def get_member_attendance(
    member_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get attendance history for a specific member."""
    repo = AttendanceRepository(db)
    records = await repo.list_member_history(
        current_user.gym_id, member_id, skip, limit
    )
    total = await repo.count_member_attendance(current_user.gym_id, member_id)
    return AttendanceListResponse(
        attendance=[_to_response(r) for r in records],
        total=total,
    )


@router.get("/member/{member_id}/qr", response_model=QRTokenResponse)
async def get_member_qr(
    member_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate QR token for a member. ADMIN/OWNER only.
    The token is deterministic — same member always gets the same token.
    Frontend encodes this into a QR image for printing/sharing.
    """
    from app.repositories.member_repository import MemberRepository

    service = AttendanceService(db)
    qr_token = await service.generate_member_qr(current_user.gym_id, member_id)

    member_repo = MemberRepository(db)
    member = await member_repo.get_by_id(member_id, current_user.gym_id)

    return QRTokenResponse(
        qr_token=qr_token,
        member_id=member_id,
        member_name=member.name if member else "Unknown",
    )
