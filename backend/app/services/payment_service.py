"""
Payment service — business logic for recording payments and renewals.

Core responsibilities:
- Validate member belongs to the same gym (tenant safety)
- Record payments atomically
- On successful payment with dates → trigger membership renewal
- Never expose raw repository to routes
"""

from datetime import date
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.events import emit, PaymentRecorded, MembershipRenewed
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.repositories.member_repository import MemberRepository
from app.repositories.payment_repository import PaymentRepository
from app.schemas.payment import PaymentCreateRequest, PaymentListResponse
from app.services.membership_service import MembershipService


class PaymentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.payment_repo = PaymentRepository(db)
        self.member_repo = MemberRepository(db)
        self.membership_service = MembershipService(db)

    async def record_payment(
        self, gym_id: UUID, user_id: UUID, data: PaymentCreateRequest
    ) -> Payment:
        """
        Record a payment for a member.

        Business rules:
        1. Member must exist and belong to the same gym
        2. Payment is created with completed/pending status
        3. If status=completed AND membership dates provided → auto-renew
        4. created_by tracks which staff recorded it (audit trail)
        """
        # Verify member belongs to this gym (tenant isolation)
        member = await self.member_repo.get_by_id(data.member_id, gym_id)
        if not member:
            raise NotFoundError("Member not found")

        payment = Payment(
            gym_id=gym_id,
            member_id=data.member_id,
            amount_in_paise=data.amount_in_paise,
            payment_method=data.payment_method,
            payment_status=data.payment_status or PaymentStatus.COMPLETED,
            payment_date=data.payment_date or date.today(),
            notes=data.notes,
            created_by=user_id,
        )
        payment = await self.payment_repo.create(payment)

        # Auto-renew membership if payment is completed and dates provided
        if (
            payment.payment_status == PaymentStatus.COMPLETED
            and data.membership_end
        ):
            await self.membership_service.renew_membership(
                member=member,
                new_end=data.membership_end,
                new_start=data.membership_start,
                plan=data.membership_plan,
            )
            emit(MembershipRenewed(
                gym_id=gym_id,
                member_id=member.id,
                new_end=data.membership_end,
                plan=data.membership_plan,
            ))

        # Emit event for future notification handlers
        emit(PaymentRecorded(
            gym_id=gym_id,
            payment_id=payment.id,
            member_id=member.id,
            amount_in_paise=payment.amount_in_paise,
            payment_method=payment.payment_method.value,
        ))

        return payment

    async def get_payment(self, payment_id: UUID, gym_id: UUID) -> Payment:
        payment = await self.payment_repo.get_by_id(payment_id, gym_id)
        if not payment:
            raise NotFoundError("Payment not found")
        return payment

    async def list_payments(
        self,
        gym_id: UUID,
        skip: int = 0,
        limit: int = 50,
        member_id: UUID | None = None,
        status: PaymentStatus | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> PaymentListResponse:
        payments = await self.payment_repo.list_by_gym(
            gym_id, skip, limit, member_id, status, date_from, date_to
        )
        total = await self.payment_repo.count_by_gym(
            gym_id, member_id, status, date_from, date_to
        )
        return PaymentListResponse(payments=payments, total=total)

    async def list_member_payments(
        self, gym_id: UUID, member_id: UUID, skip: int = 0, limit: int = 50
    ) -> PaymentListResponse:
        """Get payment history for a specific member (verifies member exists first)."""
        member = await self.member_repo.get_by_id(member_id, gym_id)
        if not member:
            raise NotFoundError("Member not found")

        payments = await self.payment_repo.list_by_member(gym_id, member_id, skip, limit)
        total = await self.payment_repo.count_by_member(gym_id, member_id)
        return PaymentListResponse(payments=payments, total=total)
