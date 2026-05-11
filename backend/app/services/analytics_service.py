"""
Analytics service — aggregation logic for dashboard analytics.

Provides revenue trends, membership distribution, and enhanced KPIs.
All queries are scoped to gym_id for tenant isolation.
Uses efficient GROUP BY aggregations to avoid N+1 patterns.
"""

from datetime import date, timedelta
from collections import defaultdict
import logging
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import today_ist
from app.models.member import Member, MembershipStatus
from app.models.payment import Payment, PaymentStatus
from app.schemas.analytics import (
    RevenueTrendPoint,
    RevenueSummary,
    RevenueTrendResponse,
    PlanDistribution,
    MembershipDistributionResponse,
    KPICard,
    DashboardKPIsResponse,
)

logger = logging.getLogger("gymflow.analytics")


class AnalyticsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Revenue Trend
    # ------------------------------------------------------------------
    async def get_revenue_trend(
        self,
        gym_id: UUID,
        granularity: str = "monthly",
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> RevenueTrendResponse:
        today = today_ist()

        if date_to is None:
            date_to = today
        if date_from is None:
            if granularity == "daily":
                date_from = date_to - timedelta(days=30)
            elif granularity == "weekly":
                date_from = date_to - timedelta(weeks=12)
            else:
                date_from = date(date_to.year - 1, date_to.month, 1)

        # Try database-native date grouping, fall back to Python if to_char isn't available
        try:
            data = await self._revenue_trend_db(gym_id, granularity, date_from, date_to)
        except Exception:
            logger.debug("DB-native revenue trend failed, falling back to Python aggregation")
            data = await self._revenue_trend_python(gym_id, granularity, date_from, date_to)

        # Fill missing periods with zeros
        filled_data = self._fill_missing_periods(data, granularity, date_from, date_to)

        # Compute summary
        summary = await self._compute_revenue_summary(gym_id, date_from, date_to, today)

        return RevenueTrendResponse(
            granularity=granularity,
            data=filled_data,
            summary=summary,
        )

    async def _revenue_trend_db(
        self,
        gym_id: UUID,
        granularity: str,
        date_from: date,
        date_to: date,
    ) -> list[RevenueTrendPoint]:
        """Try native SQL date grouping (PostgreSQL)."""
        if granularity == "daily":
            period_expr = func.to_char(Payment.payment_date, "YYYY-MM-DD")
        elif granularity == "weekly":
            # ISO week start
            period_expr = func.to_char(
                Payment.payment_date - func.extract("dow", Payment.payment_date).op("::integer"),
                "YYYY-MM-DD",
            )
        else:
            period_expr = func.to_char(Payment.payment_date, "YYYY-MM")

        stmt = (
            select(
                period_expr.label("period"),
                func.coalesce(func.sum(Payment.amount_in_paise), 0).label("revenue"),
                func.count(Payment.id).label("cnt"),
            )
            .where(
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.COMPLETED,
                Payment.payment_date >= date_from,
                Payment.payment_date <= date_to,
            )
            .group_by(period_expr)
            .order_by(period_expr)
        )

        result = await self.db.execute(stmt)
        rows = result.all()
        return [
            RevenueTrendPoint(period=str(r.period), revenue_paise=int(r.revenue), payment_count=int(r.cnt))
            for r in rows
        ]

    async def _revenue_trend_python(
        self,
        gym_id: UUID,
        granularity: str,
        date_from: date,
        date_to: date,
    ) -> list[RevenueTrendPoint]:
        """Fallback: fetch raw payments and group in Python (SQLite compat)."""
        stmt = (
            select(Payment.payment_date, Payment.amount_in_paise)
            .where(
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.COMPLETED,
                Payment.payment_date >= date_from,
                Payment.payment_date <= date_to,
            )
            .order_by(Payment.payment_date)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        buckets: dict[str, dict] = defaultdict(lambda: {"revenue": 0, "count": 0})
        for row in rows:
            pd = row.payment_date
            if granularity == "daily":
                key = pd.isoformat()
            elif granularity == "weekly":
                week_start = pd - timedelta(days=pd.weekday())
                key = week_start.isoformat()
            else:
                key = f"{pd.year}-{pd.month:02d}"
            buckets[key]["revenue"] += row.amount_in_paise
            buckets[key]["count"] += 1

        return [
            RevenueTrendPoint(period=k, revenue_paise=v["revenue"], payment_count=v["count"])
            for k, v in sorted(buckets.items())
        ]

    def _fill_missing_periods(
        self,
        data: list[RevenueTrendPoint],
        granularity: str,
        date_from: date,
        date_to: date,
    ) -> list[RevenueTrendPoint]:
        existing = {d.period: d for d in data}
        all_periods: list[str] = []

        if granularity == "daily":
            current = date_from
            while current <= date_to:
                all_periods.append(current.isoformat())
                current += timedelta(days=1)
        elif granularity == "weekly":
            current = date_from - timedelta(days=date_from.weekday())
            while current <= date_to:
                all_periods.append(current.isoformat())
                current += timedelta(weeks=1)
        else:
            current = date_from.replace(day=1)
            while current <= date_to:
                all_periods.append(f"{current.year}-{current.month:02d}")
                if current.month == 12:
                    current = current.replace(year=current.year + 1, month=1)
                else:
                    current = current.replace(month=current.month + 1)

        filled: list[RevenueTrendPoint] = []
        for p in all_periods:
            if p in existing:
                filled.append(existing[p])
            else:
                filled.append(RevenueTrendPoint(period=p, revenue_paise=0, payment_count=0))
        return filled

    async def _compute_revenue_summary(
        self,
        gym_id: UUID,
        date_from: date,
        date_to: date,
        today: date,
    ) -> RevenueSummary:
        period_length = (date_to - date_from).days
        prev_from = date_from - timedelta(days=period_length)
        prev_to = date_from - timedelta(days=1)

        # Current period revenue
        current_rev = await self._sum_completed(gym_id, date_from, date_to)
        prev_rev = await self._sum_completed(gym_id, prev_from, prev_to)

        # Growth %
        growth: float | None = None
        if prev_rev > 0:
            growth = round(((current_rev - prev_rev) / prev_rev) * 100, 1)
        elif current_rev > 0:
            growth = 100.0

        # Average daily revenue
        days_in_period = max((date_to - date_from).days, 1)
        avg_rev = current_rev // days_in_period

        # Pending dues
        pending_stmt = (
            select(func.coalesce(func.sum(Payment.amount_in_paise), 0))
            .where(
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.PENDING,
            )
        )
        pending_result = await self.db.execute(pending_stmt)
        pending_paise = int(pending_result.scalar_one())

        # Best collection day
        best_day = await self._best_collection_day(gym_id, date_from, date_to)

        # Collection rate
        total_billed = current_rev + pending_paise
        collection_rate = round((current_rev / total_billed * 100), 1) if total_billed > 0 else 100.0

        return RevenueSummary(
            total_revenue_paise=current_rev,
            previous_period_revenue_paise=prev_rev,
            growth_percent=growth,
            average_revenue_paise=avg_rev,
            pending_dues_paise=pending_paise,
            best_collection_day=best_day,
            collection_rate_percent=collection_rate,
        )

    async def _sum_completed(self, gym_id: UUID, d_from: date, d_to: date) -> int:
        stmt = (
            select(func.coalesce(func.sum(Payment.amount_in_paise), 0))
            .where(
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.COMPLETED,
                Payment.payment_date >= d_from,
                Payment.payment_date <= d_to,
            )
        )
        result = await self.db.execute(stmt)
        return int(result.scalar_one())

    async def _best_collection_day(self, gym_id: UUID, d_from: date, d_to: date) -> str | None:
        """Find the day of week with highest revenue."""
        try:
            # PostgreSQL: extract dow (0=Sunday)
            dow_expr = func.extract("dow", Payment.payment_date)
            stmt = (
                select(
                    dow_expr.label("dow"),
                    func.sum(Payment.amount_in_paise).label("total"),
                )
                .where(
                    Payment.gym_id == gym_id,
                    Payment.payment_status == PaymentStatus.COMPLETED,
                    Payment.payment_date >= d_from,
                    Payment.payment_date <= d_to,
                )
                .group_by(dow_expr)
                .order_by(func.sum(Payment.amount_in_paise).desc())
                .limit(1)
            )
            result = await self.db.execute(stmt)
            row = result.first()
            if row is None:
                return None
            day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
            return day_names[int(row.dow)]
        except Exception:
            logger.debug("DB-native best_collection_day failed, falling back to Python")
            return await self._best_collection_day_python(gym_id, d_from, d_to)

    async def _best_collection_day_python(self, gym_id: UUID, d_from: date, d_to: date) -> str | None:
        """Fallback for SQLite."""
        stmt = (
            select(Payment.payment_date, Payment.amount_in_paise)
            .where(
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.COMPLETED,
                Payment.payment_date >= d_from,
                Payment.payment_date <= d_to,
            )
        )
        result = await self.db.execute(stmt)
        rows = result.all()
        if not rows:
            return None

        day_totals: dict[int, int] = defaultdict(int)
        for row in rows:
            day_totals[row.payment_date.weekday()] += row.amount_in_paise

        if not day_totals:
            return None

        best_dow = max(day_totals, key=lambda k: day_totals[k])
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        return day_names[best_dow]

    # ------------------------------------------------------------------
    # Membership Distribution
    # ------------------------------------------------------------------
    async def get_membership_distribution(
        self,
        gym_id: UUID,
    ) -> MembershipDistributionResponse:
        # Count active members by plan
        stmt = (
            select(
                func.coalesce(Member.membership_plan, "No Plan").label("plan"),
                func.count(Member.id).label("member_count"),
            )
            .where(
                Member.gym_id == gym_id,
                Member.is_deleted == False,  # noqa: E712
                Member.membership_status == MembershipStatus.ACTIVE,
            )
            .group_by(Member.membership_plan)
            .order_by(func.count(Member.id).desc())
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        total = sum(r.member_count for r in rows)

        # Revenue by plan: sum from payments where member has that plan
        revenue_by_plan = await self._revenue_by_plan(gym_id)

        distributions: list[PlanDistribution] = []
        for r in rows:
            plan_name = str(r.plan)
            count = int(r.member_count)
            pct = round((count / total * 100), 1) if total > 0 else 0.0
            rev = revenue_by_plan.get(plan_name, 0)
            distributions.append(
                PlanDistribution(
                    plan=plan_name,
                    member_count=count,
                    percentage=pct,
                    revenue_contribution_paise=rev,
                )
            )

        most_popular = distributions[0].plan if distributions else None

        return MembershipDistributionResponse(
            distributions=distributions,
            total_members=total,
            most_popular_plan=most_popular,
        )

    async def _revenue_by_plan(self, gym_id: UUID) -> dict[str, int]:
        """Sum completed payment amounts grouped by member's current plan."""
        stmt = (
            select(
                func.coalesce(Member.membership_plan, "No Plan").label("plan"),
                func.coalesce(func.sum(Payment.amount_in_paise), 0).label("total"),
            )
            .join(Member, Payment.member_id == Member.id)
            .where(
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.COMPLETED,
                Member.is_deleted == False,  # noqa: E712
            )
            .group_by(Member.membership_plan)
        )
        result = await self.db.execute(stmt)
        return {str(r.plan): int(r.total) for r in result.all()}

    # ------------------------------------------------------------------
    # Dashboard KPIs
    # ------------------------------------------------------------------
    async def get_dashboard_kpis(
        self,
        gym_id: UUID,
        period_days: int = 30,
    ) -> DashboardKPIsResponse:
        today = today_ist()
        period_start = today - timedelta(days=period_days)
        prev_start = period_start - timedelta(days=period_days)
        prev_end = period_start - timedelta(days=1)

        kpis: list[KPICard] = []

        # 1. Total Revenue
        current_rev = await self._sum_completed(gym_id, period_start, today)
        prev_rev = await self._sum_completed(gym_id, prev_start, prev_end)
        rev_growth = self._calc_growth(current_rev, prev_rev)
        kpis.append(KPICard(
            key="total_revenue",
            label="Total Revenue",
            value=current_rev,
            previous_value=prev_rev,
            growth_percent=rev_growth,
            unit="paise",
        ))

        # 2. Active Members
        active_now = await self._count_members_by_status(gym_id, MembershipStatus.ACTIVE)
        # Approximate previous: active + recently expired in period
        expired_in_period = await self._count_expired_in_period(gym_id, period_start, today)
        prev_active = active_now + expired_in_period
        active_growth = self._calc_growth(active_now, prev_active)
        kpis.append(KPICard(
            key="active_members",
            label="Active Members",
            value=active_now,
            previous_value=prev_active,
            growth_percent=active_growth,
            unit="count",
        ))

        # 3. Attendance Today
        attendance_today = await self._attendance_today(gym_id, today)
        yesterday = today - timedelta(days=1)
        attendance_yesterday = await self._attendance_today(gym_id, yesterday)
        att_growth = self._calc_growth(attendance_today, attendance_yesterday)
        kpis.append(KPICard(
            key="attendance_today",
            label="Attendance Today",
            value=attendance_today,
            previous_value=attendance_yesterday,
            growth_percent=att_growth,
            unit="count",
        ))

        # 4. Pending Renewals (expiring in 7 days)
        from app.repositories.member_repository import MemberRepository
        member_repo = MemberRepository(self.db)
        expiring_soon = await member_repo.count_expiring_soon(gym_id, within_days=7)
        kpis.append(KPICard(
            key="pending_renewals",
            label="Pending Renewals",
            value=expiring_soon,
            previous_value=None,
            growth_percent=None,
            unit="count",
        ))

        # 5. Expiring Memberships (30 days)
        expiring_30 = await member_repo.count_expiring_soon(gym_id, within_days=30)
        kpis.append(KPICard(
            key="expiring_memberships",
            label="Expiring (30d)",
            value=expiring_30,
            previous_value=None,
            growth_percent=None,
            unit="count",
        ))

        # 6. Collection Rate
        pending_paise = await self._sum_pending(gym_id)
        total_billed = current_rev + pending_paise
        collection_rate = round((current_rev / total_billed * 100), 1) if total_billed > 0 else 100.0
        kpis.append(KPICard(
            key="collection_rate",
            label="Collection Rate",
            value=collection_rate,
            previous_value=None,
            growth_percent=None,
            unit="percent",
        ))

        period_label = f"Last {period_days} days" if period_days != 30 else "Last 30 days"
        return DashboardKPIsResponse(kpis=kpis, period_label=period_label)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _calc_growth(current: int | float, previous: int | float) -> float | None:
        if previous == 0 and current == 0:
            return 0.0
        if previous == 0:
            return 100.0
        return round(((current - previous) / previous) * 100, 1)

    async def _count_members_by_status(self, gym_id: UUID, status: MembershipStatus) -> int:
        stmt = (
            select(func.count())
            .select_from(Member)
            .where(
                Member.gym_id == gym_id,
                Member.is_deleted == False,  # noqa: E712
                Member.membership_status == status,
            )
        )
        result = await self.db.execute(stmt)
        return int(result.scalar_one())

    async def _count_expired_in_period(self, gym_id: UUID, d_from: date, d_to: date) -> int:
        """Count members whose membership ended within the given period."""
        stmt = (
            select(func.count())
            .select_from(Member)
            .where(
                Member.gym_id == gym_id,
                Member.is_deleted == False,  # noqa: E712
                Member.membership_status == MembershipStatus.EXPIRED,
                Member.membership_end.isnot(None),
                Member.membership_end >= d_from,
                Member.membership_end <= d_to,
            )
        )
        result = await self.db.execute(stmt)
        return int(result.scalar_one())

    async def _attendance_today(self, gym_id: UUID, target_date: date) -> int:
        """Count attendance check-ins for a specific date."""
        try:
            from app.models.attendance import Attendance, AttendanceStatus
            stmt = (
                select(func.count())
                .select_from(Attendance)
                .where(
                    Attendance.gym_id == gym_id,
                    Attendance.check_in_date == target_date,
                    Attendance.status != AttendanceStatus.CANCELLED,
                )
            )
            result = await self.db.execute(stmt)
            return int(result.scalar_one())
        except Exception:
            logger.debug("Attendance count query failed, returning 0")
            return 0

    async def _sum_pending(self, gym_id: UUID) -> int:
        stmt = (
            select(func.coalesce(func.sum(Payment.amount_in_paise), 0))
            .where(
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.PENDING,
            )
        )
        result = await self.db.execute(stmt)
        return int(result.scalar_one())
