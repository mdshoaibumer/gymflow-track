from datetime import date
from uuid import UUID

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment import Payment, PaymentStatus


class PaymentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, payment: Payment) -> Payment:
        self.db.add(payment)
        await self.db.flush()
        return payment

    async def get_by_id(self, payment_id: UUID, gym_id: UUID) -> Payment | None:
        result = await self.db.execute(
            select(Payment).where(Payment.id == payment_id, Payment.gym_id == gym_id)
        )
        return result.scalar_one_or_none()

    async def list_by_gym(
        self,
        gym_id: UUID,
        skip: int = 0,
        limit: int = 50,
        member_id: UUID | None = None,
        status: PaymentStatus | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[Payment]:
        """
        List payments for a gym with optional filters.
        Always scoped to gym_id — tenant isolation boundary.
        """
        query = select(Payment).where(Payment.gym_id == gym_id)

        if member_id:
            query = query.where(Payment.member_id == member_id)
        if status:
            query = query.where(Payment.payment_status == status)
        if date_from:
            query = query.where(Payment.payment_date >= date_from)
        if date_to:
            query = query.where(Payment.payment_date <= date_to)

        result = await self.db.execute(
            query.order_by(Payment.payment_date.desc(), Payment.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_by_gym(
        self,
        gym_id: UUID,
        member_id: UUID | None = None,
        status: PaymentStatus | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> int:
        """Count payments with the same filters as list_by_gym."""
        query = select(func.count()).select_from(Payment).where(Payment.gym_id == gym_id)

        if member_id:
            query = query.where(Payment.member_id == member_id)
        if status:
            query = query.where(Payment.payment_status == status)
        if date_from:
            query = query.where(Payment.payment_date >= date_from)
        if date_to:
            query = query.where(Payment.payment_date <= date_to)

        result = await self.db.execute(query)
        return result.scalar_one()

    async def sum_revenue(
        self, gym_id: UUID, date_from: date, date_to: date
    ) -> int:
        """
        Sum of completed payment amounts in paise for a date range.
        Uses the composite index (gym_id, payment_date).
        Returns 0 if no payments exist.
        """
        result = await self.db.execute(
            select(func.coalesce(func.sum(Payment.amount_in_paise), 0)).where(
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.COMPLETED,
                Payment.payment_date >= date_from,
                Payment.payment_date <= date_to,
            )
        )
        return result.scalar_one()

    async def list_by_member(
        self, gym_id: UUID, member_id: UUID, skip: int = 0, limit: int = 50
    ) -> list[Payment]:
        """Get payment history for a specific member."""
        result = await self.db.execute(
            select(Payment)
            .where(Payment.gym_id == gym_id, Payment.member_id == member_id)
            .order_by(Payment.payment_date.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_by_member(self, gym_id: UUID, member_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(Payment)
            .where(Payment.gym_id == gym_id, Payment.member_id == member_id)
        )
        return result.scalar_one()

    async def get_recent(self, gym_id: UUID, limit: int = 10) -> list[Payment]:
        """Most recent payments for dashboard display."""
        result = await self.db.execute(
            select(Payment)
            .where(
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.COMPLETED,
            )
            .order_by(Payment.payment_date.desc(), Payment.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_pending(self, gym_id: UUID) -> int:
        """Count payments with PENDING status — dues not yet collected."""
        result = await self.db.execute(
            select(func.count())
            .select_from(Payment)
            .where(
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.PENDING,
            )
        )
        return result.scalar_one()
