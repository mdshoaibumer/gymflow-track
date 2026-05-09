"""
Dashboard service — efficient aggregation for gym metrics.

Strategy:
- Each metric is a single COUNT/SUM query (no N+1)
- All queries use indexed columns (gym_id, payment_date, membership_status)
- Results are integers/counts — no object loading overhead
- Called once per dashboard load, not per-card
- Independent queries run in parallel with separate DB sessions
"""

import asyncio
from datetime import date
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.member import MembershipStatus
from app.repositories.member_repository import MemberRepository
from app.repositories.payment_repository import PaymentRepository
from app.schemas.dashboard import DashboardMetrics
from app.core.timezone import today_ist


class DashboardService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.member_repo = MemberRepository(db)
        self.payment_repo = PaymentRepository(db)

    # ************************************************************
    # Function Name : Compute Dashboard Metrics
    #
    # Purpose       : Aggregates all dashboard KPIs in optimized
    # single-count queries: total/active/expiring/
    # expired members, pending dues, and monthly
    # revenue. Each query uses indexed columns for
    # sub-millisecond performance.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
    async def get_metrics(self, gym_id: UUID) -> DashboardMetrics:
        """
        Compute all dashboard metrics with parallel queries.

        Each query runs in its own DB session to avoid sharing a single
        AsyncSession across concurrent coroutines (which is unsafe).
        """
        today = today_ist()
        month_start = today.replace(day=1)

        async def _count_total() -> int:
            async with async_session_factory() as s:
                return await MemberRepository(s).count_by_gym(gym_id)

        async def _count_active() -> int:
            async with async_session_factory() as s:
                return await MemberRepository(s).count_by_status(gym_id, MembershipStatus.ACTIVE)

        async def _count_expiring() -> int:
            async with async_session_factory() as s:
                return await MemberRepository(s).count_expiring_soon(gym_id, within_days=7)

        async def _count_expired() -> int:
            async with async_session_factory() as s:
                return await MemberRepository(s).count_by_status(gym_id, MembershipStatus.EXPIRED)

        async def _count_pending() -> int:
            async with async_session_factory() as s:
                return await PaymentRepository(s).count_pending(gym_id)

        async def _sum_revenue() -> int:
            async with async_session_factory() as s:
                return await PaymentRepository(s).sum_revenue(gym_id, month_start, today)

        (
            total_members,
            active_members,
            expiring_soon,
            expired_members,
            pending_dues,
            monthly_revenue,
        ) = await asyncio.gather(
            _count_total(),
            _count_active(),
            _count_expiring(),
            _count_expired(),
            _count_pending(),
            _sum_revenue(),
        )

        return DashboardMetrics(
            total_members=total_members,
            active_members=active_members,
            expiring_soon=expiring_soon,
            expired_members=expired_members,
            pending_dues_count=pending_dues,
            monthly_revenue_paise=monthly_revenue,
        )

    async def get_recent_payments(self, gym_id: UUID, limit: int = 10) -> list:
        """Delegate recent payments to the payment repository."""
        return await self.payment_repo.get_recent(gym_id, limit=limit)
