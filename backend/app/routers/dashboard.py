from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user
from app.schemas.dashboard import (
    DashboardMetrics,
    ExpiringMemberResponse,
    RecentPaymentResponse,
)
from app.services.dashboard_service import DashboardService
from app.services.membership_service import MembershipService
from app.repositories.payment_repository import PaymentRepository

router = APIRouter()


@router.get("/metrics", response_model=DashboardMetrics)
async def get_dashboard_metrics(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get aggregated dashboard metrics for the gym.

    Returns counts and revenue in a single response to minimize
    frontend round-trips. Each metric is a single indexed query.
    """
    service = DashboardService(db)
    return await service.get_metrics(current_user.gym_id)


@router.get("/expiring", response_model=list[ExpiringMemberResponse])
async def get_expiring_memberships(
    days: int = Query(7, ge=1, le=30),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Members whose membership expires within N days.
    Used for renewal reminders and dashboard alerts.
    """
    service = MembershipService(db)
    return await service.get_expiring_members(current_user.gym_id, within_days=days)


@router.get("/recent-payments", response_model=list[RecentPaymentResponse])
async def get_recent_payments(
    limit: int = Query(10, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Most recent completed payments for the dashboard feed."""
    repo = PaymentRepository(db)
    return await repo.get_recent(current_user.gym_id, limit=limit)
