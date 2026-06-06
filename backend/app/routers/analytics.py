from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_admin
from app.schemas.analytics import (
    RevenueTrendResponse,
    MembershipDistributionResponse,
    DashboardKPIsResponse,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter()


@router.get("/revenue-trend", response_model=RevenueTrendResponse)
async def get_revenue_trend(
    granularity: str = Query("monthly", pattern="^(daily|weekly|monthly)$"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Revenue trend data grouped by day, week, or month.

    Returns time-series revenue data with a summary including
    growth %, average revenue, best collection day, and collection rate.
    Missing periods are filled with zeros for consistent charting.
    """
    service = AnalyticsService(db)
    return await service.get_revenue_trend(
        gym_id=current_user.gym_id,
        granularity=granularity,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/revenue-summary")
async def get_revenue_summary(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Revenue summary for the given period."""
    service = AnalyticsService(db)
    result = await service.get_revenue_trend(
        gym_id=current_user.gym_id,
        granularity="monthly",
        date_from=date_from,
        date_to=date_to,
    )
    return result.summary


@router.get("/membership-distribution", response_model=MembershipDistributionResponse)
async def get_membership_distribution(
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Active membership distribution by plan type.

    Returns count, percentage, and revenue contribution for each plan.
    """
    service = AnalyticsService(db)
    return await service.get_membership_distribution(gym_id=current_user.gym_id)


@router.get("/dashboard-kpis", response_model=DashboardKPIsResponse)
async def get_dashboard_kpis(
    period_days: int = Query(30, ge=1, le=365),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Enhanced KPI cards with trend data.

    Returns KPIs including revenue, active members, attendance,
    renewals, expirations, and collection rate — each with
    period-over-period comparison when available.
    """
    service = AnalyticsService(db)
    return await service.get_dashboard_kpis(
        gym_id=current_user.gym_id,
        period_days=period_days,
    )
