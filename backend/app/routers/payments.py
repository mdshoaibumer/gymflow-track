from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_admin
from app.models.payment import PaymentStatus
from app.schemas.payment import PaymentCreateRequest, PaymentListResponse, PaymentResponse
from app.services.payment_service import PaymentService

router = APIRouter()


@router.post("", response_model=PaymentResponse, status_code=201)
async def record_payment(
    data: PaymentCreateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Record a new payment. OWNER and ADMIN only.

    If membership_end is provided and payment is completed,
    the member's membership is automatically renewed.
    """
    service = PaymentService(db)
    return await service.record_payment(
        gym_id=current_user.gym_id,
        user_id=current_user.user_id,
        data=data,
    )


@router.get("", response_model=PaymentListResponse)
async def list_payments(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    member_id: UUID | None = Query(None),
    status: PaymentStatus | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List payments with optional filters.

    Supports filtering by:
    - member_id: payments for a specific member
    - status: completed, pending, failed, refunded
    - date_from/date_to: date range

    All roles can view payments (read access).
    """
    service = PaymentService(db)
    return await service.list_payments(
        gym_id=current_user.gym_id,
        skip=skip,
        limit=limit,
        member_id=member_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific payment by ID. All roles can view."""
    service = PaymentService(db)
    return await service.get_payment(payment_id, current_user.gym_id)
