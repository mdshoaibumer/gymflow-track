"""
Due Management router — API endpoints for tracking and collecting
outstanding member balances.

All endpoints require ADMIN or OWNER role (same as payments).
Waive requires OWNER only.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, require_admin, require_owner
from app.models.due import DueStatus
from app.schemas.due import (
    AgingBucket,
    AgingReportResponse,
    DueDetailResponse,
    DueListResponse,
    DueMemberBrief,
    DuePaymentLinkResponse,
    DuePaymentRequest,
    DueResponse,
    DueSummaryResponse,
    DueWaiveRequest,
)
from app.services.due_service import DueService

router = APIRouter()


@router.get("", response_model=DueListResponse)
async def list_dues(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: DueStatus | None = Query(None),
    member_id: UUID | None = Query(None),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List outstanding dues for the gym. Defaults to pending/partial only."""
    service = DueService(db)
    items, total, outstanding = await service.list_dues(
        gym_id=current_user.gym_id,
        skip=skip,
        limit=limit,
        status=status,
        member_id=member_id,
    )
    return DueListResponse(
        items=[_due_to_response(d) for d in items],
        total=total,
        total_outstanding_paise=outstanding,
    )


@router.get("/summary", response_model=DueSummaryResponse)
async def get_due_summary(
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard summary: total outstanding, member count, collected this month."""
    service = DueService(db)
    summary = await service.get_summary(current_user.gym_id)
    return DueSummaryResponse(**summary)


@router.get("/aging-report", response_model=AgingReportResponse)
async def get_aging_report(
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Aging report with bucketed outstanding dues (0-30, 31-60, 61-90, 90+ days)."""
    service = DueService(db)
    buckets, total = await service.get_aging_report(current_user.gym_id)
    return AgingReportResponse(
        buckets=[AgingBucket(**b) for b in buckets],
        total_outstanding_paise=total,
    )


@router.get("/member/{member_id}", response_model=list[DueResponse])
async def get_member_dues(
    member_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get all dues (all statuses) for a specific member."""
    service = DueService(db)
    dues = await service.get_member_dues(member_id, current_user.gym_id)
    return [_due_to_response(d) for d in dues]


@router.get("/{due_id}", response_model=DueDetailResponse)
async def get_due_detail(
    due_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a single due with its linked payments."""
    service = DueService(db)
    due = await service.get_due_detail(due_id, current_user.gym_id)
    return _due_to_detail_response(due)


@router.post("/{due_id}/pay", response_model=DueResponse, status_code=201)
async def record_due_payment(
    due_id: UUID,
    data: DuePaymentRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Record a partial or full payment against an outstanding due."""
    service = DueService(db)
    due, _payment = await service.record_due_payment(
        due_id=due_id,
        gym_id=current_user.gym_id,
        user_id=current_user.user_id,
        amount_in_paise=data.amount_in_paise,
        payment_method=data.payment_method,
        payment_date=data.payment_date,
        notes=data.notes,
        idempotency_key=data.idempotency_key,
    )
    return _due_to_response(due)


@router.post("/{due_id}/waive", response_model=DueResponse)
async def waive_due(
    due_id: UUID,
    data: DueWaiveRequest,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Waive (write off) an outstanding due. OWNER only."""
    service = DueService(db)
    due = await service.waive_due(
        due_id=due_id,
        gym_id=current_user.gym_id,
        user_id=current_user.user_id,
        reason=data.reason,
    )
    return _due_to_response(due)


# --- Response helpers ---


def _due_to_response(due) -> DueResponse:
    """Convert a MemberDue ORM object to a DueResponse."""
    member_brief = None
    try:
        from sqlalchemy import inspect as sa_inspect
        state = sa_inspect(due)
        if "member" in state.dict:
            m = due.member
            member_brief = DueMemberBrief(
                id=m.id, name=m.name, phone=m.phone, photo_url=m.photo_url,
            )
    except Exception:
        pass

    return DueResponse(
        id=due.id,
        gym_id=due.gym_id,
        member_id=due.member_id,
        plan_name=due.plan_name,
        plan_amount_paise=due.plan_amount_paise,
        discount_paise=due.discount_paise,
        effective_amount_paise=due.effective_amount_paise,
        total_paid_paise=due.total_paid_paise,
        balance_paise=due.balance_paise,
        due_date=due.due_date,
        status=due.status,
        waive_reason=due.waive_reason,
        created_at=due.created_at,
        updated_at=due.updated_at,
        member=member_brief,
    )


def _due_to_detail_response(due) -> DueDetailResponse:
    """Convert a MemberDue (with due_payments loaded) to DueDetailResponse."""
    base = _due_to_response(due)
    payments = []
    try:
        from sqlalchemy import inspect as sa_inspect
        state = sa_inspect(due)
        if "due_payments" in state.dict:
            payments = [
                DuePaymentLinkResponse(
                    id=dp.id,
                    payment_id=dp.payment_id,
                    amount_paise=dp.amount_paise,
                    created_at=dp.created_at,
                )
                for dp in due.due_payments
            ]
    except Exception:
        pass

    return DueDetailResponse(
        **base.model_dump(),
        payments=payments,
    )
