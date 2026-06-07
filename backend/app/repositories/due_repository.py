"""
Due repository — data access for member dues and due payments.

All queries are scoped by gym_id for tenant isolation.
Uses flush() (not commit()) so callers control transaction boundaries.
"""

from datetime import date
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.due import DuePayment, DueStatus, MemberDue


class DueRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, due: MemberDue) -> MemberDue:
        self.db.add(due)
        await self.db.flush()
        return due

    async def create_due_payment(self, due_payment: DuePayment) -> DuePayment:
        self.db.add(due_payment)
        await self.db.flush()
        return due_payment

    async def get_by_id(self, due_id: UUID, gym_id: UUID) -> MemberDue | None:
        result = await self.db.execute(
            select(MemberDue)
            .where(MemberDue.id == due_id, MemberDue.gym_id == gym_id)
            .options(selectinload(MemberDue.member))
        )
        return result.scalar_one_or_none()

    async def get_with_payments(self, due_id: UUID, gym_id: UUID) -> MemberDue | None:
        result = await self.db.execute(
            select(MemberDue)
            .where(MemberDue.id == due_id, MemberDue.gym_id == gym_id)
            .options(
                selectinload(MemberDue.member),
                selectinload(MemberDue.due_payments),
            )
        )
        return result.scalar_one_or_none()

    async def get_open_dues_for_member(
        self, member_id: UUID, gym_id: UUID
    ) -> list[MemberDue]:
        """Get all pending/partial dues for a member, oldest first."""
        result = await self.db.execute(
            select(MemberDue)
            .where(
                MemberDue.member_id == member_id,
                MemberDue.gym_id == gym_id,
                MemberDue.status.in_([DueStatus.PENDING, DueStatus.PARTIAL]),
            )
            .order_by(MemberDue.due_date.asc())
        )
        return list(result.scalars().all())

    async def list_by_gym(
        self,
        gym_id: UUID,
        skip: int = 0,
        limit: int = 50,
        status: DueStatus | None = None,
        member_id: UUID | None = None,
    ) -> list[MemberDue]:
        query = (
            select(MemberDue)
            .where(MemberDue.gym_id == gym_id)
            .options(selectinload(MemberDue.member))
        )

        if status:
            query = query.where(MemberDue.status == status)
        else:
            # Default: show only outstanding (pending/partial)
            query = query.where(
                MemberDue.status.in_([DueStatus.PENDING, DueStatus.PARTIAL])
            )

        if member_id:
            query = query.where(MemberDue.member_id == member_id)

        result = await self.db.execute(
            query.order_by(MemberDue.balance_paise.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().unique().all())

    async def count_by_gym(
        self,
        gym_id: UUID,
        status: DueStatus | None = None,
        member_id: UUID | None = None,
    ) -> int:
        query = (
            select(func.count())
            .select_from(MemberDue)
            .where(MemberDue.gym_id == gym_id)
        )

        if status:
            query = query.where(MemberDue.status == status)
        else:
            query = query.where(
                MemberDue.status.in_([DueStatus.PENDING, DueStatus.PARTIAL])
            )

        if member_id:
            query = query.where(MemberDue.member_id == member_id)

        result = await self.db.execute(query)
        return result.scalar_one()

    async def total_outstanding(self, gym_id: UUID) -> int:
        """Sum of all outstanding balances for a gym."""
        result = await self.db.execute(
            select(func.coalesce(func.sum(MemberDue.balance_paise), 0)).where(
                MemberDue.gym_id == gym_id,
                MemberDue.status.in_([DueStatus.PENDING, DueStatus.PARTIAL]),
            )
        )
        return result.scalar_one()

    async def members_with_dues_count(self, gym_id: UUID) -> int:
        """Count of distinct members who have outstanding dues."""
        result = await self.db.execute(
            select(func.count(func.distinct(MemberDue.member_id))).where(
                MemberDue.gym_id == gym_id,
                MemberDue.status.in_([DueStatus.PENDING, DueStatus.PARTIAL]),
            )
        )
        return result.scalar_one()

    async def collected_this_month(self, gym_id: UUID, month_start: date) -> int:
        """Sum of due payments collected since month_start."""
        result = await self.db.execute(
            select(func.coalesce(func.sum(DuePayment.amount_paise), 0)).where(
                DuePayment.gym_id == gym_id,
                DuePayment.created_at >= month_start,
            )
        )
        return result.scalar_one()

    async def aging_report(
        self, gym_id: UUID, today: date
    ) -> list[dict]:
        """
        Compute aging buckets for outstanding dues.

        Returns list of dicts: [{"range": "0-30", "count": 5, "total_paise": 50000}, ...]
        """
        today_lit = sa.literal(today, type_=sa.Date)

        # Use case() to bucket into aging ranges
        bucket = case(
            (MemberDue.due_date >= today_lit, "not_yet_due"),
            (today_lit - MemberDue.due_date <= 30, "0-30"),
            (today_lit - MemberDue.due_date <= 60, "31-60"),
            (today_lit - MemberDue.due_date <= 90, "61-90"),
            else_="90+",
        )

        result = await self.db.execute(
            select(
                bucket.label("range"),
                func.count().label("count"),
                func.coalesce(func.sum(MemberDue.balance_paise), 0).label("total_paise"),
            )
            .where(
                MemberDue.gym_id == gym_id,
                MemberDue.status.in_([DueStatus.PENDING, DueStatus.PARTIAL]),
            )
            .group_by(bucket)
        )
        return [dict(row._mapping) for row in result.all()]

    async def get_due_payments_for_payment(
        self, payment_id: UUID, gym_id: UUID
    ) -> list[DuePayment]:
        """Find all due_payment links for a given payment (used during void)."""
        result = await self.db.execute(
            select(DuePayment).where(
                DuePayment.payment_id == payment_id,
                DuePayment.gym_id == gym_id,
            )
        )
        return list(result.scalars().all())

    async def list_member_dues(
        self, member_id: UUID, gym_id: UUID
    ) -> list[MemberDue]:
        """Get all dues for a specific member, newest first."""
        result = await self.db.execute(
            select(MemberDue)
            .where(MemberDue.member_id == member_id, MemberDue.gym_id == gym_id)
            .order_by(MemberDue.created_at.desc())
        )
        return list(result.scalars().all())
