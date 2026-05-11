"""
Reports & Export API routes — CSV exports for members, payments, attendance.

Endpoints:
- GET /reports/members/csv — Export members as CSV
- GET /reports/payments/csv — Export payments as CSV
- GET /reports/attendance/csv — Export attendance as CSV

RBAC: ADMIN/OWNER only.
"""

import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, require_admin
from app.core.billing_dependencies import require_export_reports
from app.core.timezone import today_ist
from app.repositories.member_repository import MemberRepository
from app.repositories.payment_repository import PaymentRepository
from app.repositories.attendance_repository import AttendanceRepository

router = APIRouter()

MAX_EXPORT_ROWS = 10000


def _csv_response(output: io.StringIO, filename: str) -> StreamingResponse:
    """Create a StreamingResponse for a CSV file."""
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/members/csv")
async def export_members_csv(
    search: str | None = Query(None, max_length=100),
    current_user: CurrentUser = Depends(require_admin),
    _export: CurrentUser = Depends(require_export_reports),
    db: AsyncSession = Depends(get_db),
):
    """Export all members as CSV. ADMIN/OWNER only. Requires Pro plan or above."""
    repo = MemberRepository(db)
    members = await repo.list_by_gym(
        current_user.gym_id, skip=0, limit=MAX_EXPORT_ROWS, search=search
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Name", "Phone", "Email", "Gender", "Plan",
        "Status", "Start Date", "End Date", "Amount Paid (₹)",
    ])

    for m in members:
        writer.writerow([
            m.name,
            m.phone,
            m.email or "",
            m.gender or "",
            m.membership_plan or "",
            m.membership_status.value if m.membership_status else "",
            str(m.membership_start) if m.membership_start else "",
            str(m.membership_end) if m.membership_end else "",
            f"{(m.amount_paid or 0) / 100:.2f}",
        ])

    today = today_ist()
    return _csv_response(output, f"members_{today}.csv")


@router.get("/payments/csv")
async def export_payments_csv(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    current_user: CurrentUser = Depends(require_admin),
    _export: CurrentUser = Depends(require_export_reports),
    db: AsyncSession = Depends(get_db),
):
    """Export payments as CSV with optional date filter. Requires Pro plan or above."""
    repo = PaymentRepository(db)
    payments = await repo.list_by_gym(
        current_user.gym_id,
        skip=0,
        limit=MAX_EXPORT_ROWS,
        date_from=date_from,
        date_to=date_to,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Date", "Member", "Amount (₹)", "Method", "Status", "Notes",
    ])

    for p in payments:
        member_name = p.member.name if p.member else ""

        writer.writerow([
            str(p.payment_date),
            member_name,
            f"{p.amount_in_paise / 100:.2f}",
            p.payment_method.value,
            p.payment_status.value,
            p.notes or "",
        ])

    today = today_ist()
    return _csv_response(output, f"payments_{today}.csv")


@router.get("/attendance/csv")
async def export_attendance_csv(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    current_user: CurrentUser = Depends(require_admin),
    _export: CurrentUser = Depends(require_export_reports),
    db: AsyncSession = Depends(get_db),
):
    """Export attendance history as CSV. Requires Pro plan or above."""
    repo = AttendanceRepository(db)
    records = await repo.list_history(
        current_user.gym_id,
        start_date=start_date,
        end_date=end_date,
        skip=0,
        limit=MAX_EXPORT_ROWS,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Date", "Member", "Phone", "Check In", "Check Out", "Source", "Status",
    ])

    for r in records:
        member_name = r.member.name if r.member else ""
        member_phone = r.member.phone if r.member else ""

        writer.writerow([
            str(r.check_in_date),
            member_name,
            member_phone,
            r.check_in_at.strftime("%H:%M") if r.check_in_at else "",
            r.check_out_at.strftime("%H:%M") if r.check_out_at else "",
            r.source.value if r.source else "",
            r.status.value if r.status else "",
        ])

    today = today_ist()
    return _csv_response(output, f"attendance_{today}.csv")
