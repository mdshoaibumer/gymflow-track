"""
Due Management service — business logic for tracking and collecting
outstanding member balances.

Core responsibilities:
- Create dues when partial payments are detected
- Record payments against outstanding dues
- Waive dues with audit trail
- Compute aging reports and summaries
- Reverse due payments when a payment is voided
"""

from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.timezone import today_ist
from app.models.due import DuePayment, DueStatus, MemberDue
from app.models.gym_audit_log import GymAuditLog, GymAuditAction
from app.models.member import Member
from app.models.membership_plan import GymMembershipPlan
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.repositories.due_repository import DueRepository
from app.repositories.member_repository import MemberRepository
from app.repositories.payment_repository import PaymentRepository


class DueService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.due_repo = DueRepository(db)
        self.member_repo = MemberRepository(db)
        self.payment_repo = PaymentRepository(db)

    # --- Auto-creation (called from PaymentService) ---

    async def maybe_create_due(
        self,
        gym_id: UUID,
        member_id: UUID,
        payment: Payment,
        plan_name: str | None,
        discount_paise: int,
    ) -> MemberDue | None:
        """
        Check if a payment is partial against the plan price and create
        a due record if so. Called automatically from PaymentService.

        Returns the created MemberDue or None if fully paid / no plan found.
        """
        if not plan_name:
            return None

        # Look up plan price by name within this gym
        plan_amount_rupees = await self._lookup_plan_price(gym_id, plan_name)
        if plan_amount_rupees is None:
            return None

        plan_amount_paise = plan_amount_rupees * 100
        effective_amount = plan_amount_paise - discount_paise

        if effective_amount <= 0:
            return None

        amount_paid = payment.amount_in_paise
        if amount_paid >= effective_amount:
            # Fully paid (with or without discount) — no due needed
            return None

        balance = effective_amount - amount_paid
        due_date = today_ist() + timedelta(days=30)

        due = MemberDue(
            gym_id=gym_id,
            member_id=member_id,
            plan_name=plan_name,
            plan_amount_paise=plan_amount_paise,
            discount_paise=discount_paise,
            effective_amount_paise=effective_amount,
            total_paid_paise=amount_paid,
            balance_paise=balance,
            due_date=due_date,
            status=DueStatus.PARTIAL,
        )
        due = await self.due_repo.create(due)

        # Link the initial payment to this due
        link = DuePayment(
            gym_id=gym_id,
            due_id=due.id,
            payment_id=payment.id,
            amount_paise=amount_paid,
        )
        await self.due_repo.create_due_payment(link)

        return due

    # --- Record payment against an existing due ---

    async def record_due_payment(
        self,
        due_id: UUID,
        gym_id: UUID,
        user_id: UUID,
        amount_in_paise: int,
        payment_method: PaymentMethod,
        payment_date: date | None = None,
        notes: str | None = None,
        idempotency_key: str | None = None,
    ) -> tuple[MemberDue, Payment]:
        """
        Record a partial or full payment against an outstanding due.

        Creates a Payment record and links it to the due. Updates the
        due's total_paid and balance. If balance reaches zero, marks as PAID.
        Also updates member.amount_paid atomically.
        """
        due = await self.due_repo.get_by_id(due_id, gym_id)
        if not due:
            raise NotFoundError("Due not found")

        if due.status in (DueStatus.PAID, DueStatus.WAIVED):
            raise ValidationError(
                f"This due is already {due.status.value}. No further payments accepted."
            )

        if amount_in_paise > due.balance_paise:
            raise ValidationError(
                f"Payment amount (₹{amount_in_paise / 100:.2f}) exceeds outstanding "
                f"balance (₹{due.balance_paise / 100:.2f})"
            )

        # Check idempotency
        if idempotency_key:
            existing = await self.payment_repo.get_by_idempotency_key(
                gym_id, idempotency_key
            )
            if existing:
                return due, existing

        # Create the payment record (reuses existing Payment model)
        payment = Payment(
            gym_id=gym_id,
            member_id=due.member_id,
            amount_in_paise=amount_in_paise,
            payment_method=payment_method,
            payment_status=PaymentStatus.COMPLETED,
            payment_date=payment_date or today_ist(),
            notes=notes or f"Due payment for {due.plan_name}",
            idempotency_key=idempotency_key,
            created_by=user_id,
        )
        payment = await self.payment_repo.create(payment)

        # Link payment to due
        link = DuePayment(
            gym_id=gym_id,
            due_id=due.id,
            payment_id=payment.id,
            amount_paise=amount_in_paise,
        )
        await self.due_repo.create_due_payment(link)

        # Update due balance
        due.total_paid_paise += amount_in_paise
        due.balance_paise -= amount_in_paise

        if due.balance_paise <= 0:
            due.status = DueStatus.PAID
            due.balance_paise = 0
        else:
            due.status = DueStatus.PARTIAL

        await self.db.flush()

        # Update member.amount_paid atomically
        member = await self.member_repo.get_by_id(due.member_id, gym_id)
        if member:
            member.amount_paid = Member.amount_paid + amount_in_paise
            await self.db.flush()

        return due, payment

    # --- Waive a due ---

    async def waive_due(
        self, due_id: UUID, gym_id: UUID, user_id: UUID, reason: str
    ) -> MemberDue:
        """Write off an outstanding due with audit trail."""
        due = await self.due_repo.get_by_id(due_id, gym_id)
        if not due:
            raise NotFoundError("Due not found")

        if due.status in (DueStatus.PAID, DueStatus.WAIVED):
            raise ValidationError(
                f"Cannot waive a due that is already {due.status.value}"
            )

        old_balance = due.balance_paise
        due.status = DueStatus.WAIVED
        due.waive_reason = reason
        due.waived_by = user_id
        due.balance_paise = 0
        await self.db.flush()

        # Audit trail
        audit = GymAuditLog(
            gym_id=gym_id,
            entity_type="member_due",
            entity_id=due_id,
            action=GymAuditAction.DUE_WAIVED,
            old_data={"balance_paise": old_balance, "status": "partial"},
            new_data={"balance_paise": 0, "status": "waived", "reason": reason},
            description=f"Due of ₹{old_balance / 100:.2f} waived for {due.plan_name}. Reason: {reason}",
            performed_by=user_id,
        )
        self.db.add(audit)
        await self.db.flush()

        return due

    # --- Void reversal (called from PaymentService on void) ---

    async def reverse_payment(
        self, payment_id: UUID, gym_id: UUID
    ) -> None:
        """
        When a payment is voided, reverse its effect on any linked dues.

        Finds all due_payment links for the voided payment and restores
        the balance on each linked due.
        """
        links = await self.due_repo.get_due_payments_for_payment(payment_id, gym_id)
        for link in links:
            due = await self.due_repo.get_by_id(link.due_id, gym_id)
            if not due:
                continue

            # Restore balance
            due.total_paid_paise -= link.amount_paise
            due.balance_paise += link.amount_paise

            # Recompute status
            if due.total_paid_paise <= 0:
                due.status = DueStatus.PENDING
                due.total_paid_paise = 0
            else:
                due.status = DueStatus.PARTIAL

            await self.db.flush()

    # --- Query methods ---

    async def list_dues(
        self,
        gym_id: UUID,
        skip: int = 0,
        limit: int = 50,
        status: DueStatus | None = None,
        member_id: UUID | None = None,
    ):
        items = await self.due_repo.list_by_gym(gym_id, skip, limit, status, member_id)
        total = await self.due_repo.count_by_gym(gym_id, status, member_id)
        outstanding = await self.due_repo.total_outstanding(gym_id)
        return items, total, outstanding

    async def get_due_detail(self, due_id: UUID, gym_id: UUID) -> MemberDue:
        due = await self.due_repo.get_with_payments(due_id, gym_id)
        if not due:
            raise NotFoundError("Due not found")
        return due

    async def get_member_dues(self, member_id: UUID, gym_id: UUID) -> list[MemberDue]:
        member = await self.member_repo.get_by_id(member_id, gym_id)
        if not member:
            raise NotFoundError("Member not found")
        return await self.due_repo.list_member_dues(member_id, gym_id)

    async def get_summary(self, gym_id: UUID):
        total_members = await self.due_repo.members_with_dues_count(gym_id)
        total_outstanding = await self.due_repo.total_outstanding(gym_id)
        month_start = today_ist().replace(day=1)
        collected = await self.due_repo.collected_this_month(gym_id, month_start)
        return {
            "total_members_with_dues": total_members,
            "total_outstanding_paise": total_outstanding,
            "collected_this_month_paise": collected,
        }

    async def get_aging_report(self, gym_id: UUID):
        today = today_ist()
        buckets = await self.due_repo.aging_report(gym_id, today)
        total = await self.due_repo.total_outstanding(gym_id)

        # Ensure all expected buckets exist (even if 0)
        expected = ["not_yet_due", "0-30", "31-60", "61-90", "90+"]
        bucket_map = {b["range"]: b for b in buckets}
        result = []
        for r in expected:
            if r in bucket_map:
                result.append(bucket_map[r])
            else:
                result.append({"range": r, "count": 0, "total_paise": 0})

        return result, total

    # --- Internal helpers ---

    async def _lookup_plan_price(
        self, gym_id: UUID, plan_name: str
    ) -> int | None:
        """Look up plan price (in rupees) by name within a gym."""
        result = await self.db.execute(
            select(GymMembershipPlan.amount).where(
                GymMembershipPlan.gym_id == gym_id,
                GymMembershipPlan.name == plan_name,
                GymMembershipPlan.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()
