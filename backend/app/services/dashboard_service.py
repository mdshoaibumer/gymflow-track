"""
Dashboard service — efficient aggregation for gym metrics.

Strategy:
- Each metric is a single COUNT/SUM query (no N+1)
- All queries use indexed columns (gym_id, payment_date, membership_status)
- Results are integers/counts — no object loading overhead
- Called once per dashboard load, not per-card
- Queries run sequentially on a single safe DB session
"""

from datetime import date
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

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
        # Compute all dashboard metrics with parallel queries.

        total_members = await self.member_repo.count_by_gym(gym_id)
        active_members = await self.member_repo.count_by_status(gym_id, MembershipStatus.ACTIVE)
        expiring_soon = await self.member_repo.count_expiring_soon(gym_id, within_days=7)
        expired_members = await self.member_repo.count_by_status(gym_id, MembershipStatus.EXPIRED)
        pending_dues = await self.payment_repo.count_pending(gym_id)
        monthly_revenue = await self.payment_repo.sum_revenue(gym_id, month_start, today)

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
