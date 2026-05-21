"""
Payment service — business logic for recording payments and renewals.

Core responsibilities:
- Validate member belongs to the same gym (tenant safety)
- Record payments atomically
- On successful payment with dates → trigger membership renewal
- Void payments with full audit trail
- Recompute financial totals from payment ledger
- Never expose raw repository to routes
"""

from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.events import emit, PaymentRecorded, MembershipRenewed
from app.core.timezone import today_ist
from app.models.member import Member
from app.models.payment import Payment, PaymentStatus
from app.models.gym_audit_log import GymAuditLog, GymAuditAction
from app.repositories.member_repository import MemberRepository
from app.repositories.payment_repository import PaymentRepository
from app.schemas.payment import PaymentCreateRequest, PaymentListResponse, PaymentUpdateRequest, VoidPaymentRequest
from app.services.membership_service import MembershipService
from app.services.invoice_service import InvoiceService


class PaymentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.payment_repo = PaymentRepository(db)
        self.member_repo = MemberRepository(db)
        self.membership_service = MembershipService(db)
        self.invoice_service = InvoiceService(db)

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

        # Idempotency check: if the client supplied a key and a payment with
        # that key already exists for this gym, return the existing payment
        # instead of creating a duplicate (safe retry on double-click/network replay).
        if data.idempotency_key:
            existing = await self.payment_repo.get_by_idempotency_key(
                gym_id, data.idempotency_key
            )
            if existing:
                return existing

        payment = Payment(
            gym_id=gym_id,
            member_id=data.member_id,
            amount_in_paise=data.amount_in_paise,
            payment_method=data.payment_method,
            payment_status=data.payment_status or PaymentStatus.COMPLETED,
            payment_date=data.payment_date or today_ist(),
            notes=data.notes,
            idempotency_key=data.idempotency_key,
            created_by=user_id,
        )
        try:
            payment = await self.payment_repo.create(payment)
        except IntegrityError:
            # Race condition: another concurrent request inserted a payment with
            # the same idempotency key between our SELECT and INSERT. The partial
            # unique index on (gym_id, idempotency_key) caught it. Return the
            # existing payment instead of creating a duplicate charge.
            await self.db.rollback()
            if data.idempotency_key:
                existing = await self.payment_repo.get_by_idempotency_key(
                    gym_id, data.idempotency_key
                )
                if existing:
                    return existing
            raise

        # Atomically update amount_paid on the member using SQL-level addition
        # to prevent lost-update race conditions from concurrent payments.
        if payment.payment_status == PaymentStatus.COMPLETED:
            member.amount_paid = Member.amount_paid + payment.amount_in_paise
            await self.db.flush()

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

        # Auto-generate invoice for completed payments
        if payment.payment_status == PaymentStatus.COMPLETED:
            await self.invoice_service.generate_invoice(payment, gym_id)

        return payment

    async def get_payment(self, payment_id: UUID, gym_id: UUID) -> Payment:
        payment = await self.payment_repo.get_by_id(payment_id, gym_id)
        if not payment:
            raise NotFoundError("Payment not found")
        return payment

    async def update_payment(
        self, payment_id: UUID, gym_id: UUID, user_id: UUID, data: PaymentUpdateRequest
    ) -> Payment:
        """
        Edit a payment.

        Rules:
        - Pending payments: all fields are editable.
        - Completed payments: only notes and payment_method are editable.
        - Refunded/Failed payments cannot be edited.
        - If a pending payment is marked as completed, membership renewal
          and invoice generation are triggered.
        - If a completed payment's notes/method change, the linked invoice is updated.
        """
        payment = await self.payment_repo.get_by_id(payment_id, gym_id)
        if not payment:
            raise NotFoundError("Payment not found")

        if payment.payment_status == PaymentStatus.REFUNDED:
            raise ValidationError("Cannot edit a voided/refunded payment")
        if payment.payment_status == PaymentStatus.FAILED:
            raise ValidationError("Cannot edit a failed payment")

        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            raise ValidationError("No fields provided for update")

        old_status = payment.payment_status
        old_data = {
            "amount_in_paise": payment.amount_in_paise,
            "payment_method": payment.payment_method.value,
            "payment_status": payment.payment_status.value,
            "payment_date": str(payment.payment_date),
            "notes": payment.notes,
        }

        # Completed payments: only allow notes and payment_method changes
        if old_status == PaymentStatus.COMPLETED:
            forbidden = set(update_data.keys()) - {"notes", "payment_method"}
            if forbidden:
                raise ValidationError(
                    "Completed payments can only have notes and payment method edited. "
                    "Use void to reverse, or contact support."
                )

        # Apply updates
        for field in ("amount_in_paise", "payment_method", "payment_status", "payment_date", "notes"):
            if field in update_data:
                setattr(payment, field, update_data[field])

        await self.db.flush()

        new_status = payment.payment_status

        # If pending → completed, trigger membership renewal and invoice
        if old_status == PaymentStatus.PENDING and new_status == PaymentStatus.COMPLETED:
            member = await self.member_repo.get_by_id(payment.member_id, gym_id)
            if member:
                member.amount_paid = Member.amount_paid + payment.amount_in_paise
                await self.db.flush()

            # Renew membership if dates provided in the edit or original payment
            membership_end = update_data.get("membership_end") or data.membership_end
            membership_start = update_data.get("membership_start") or data.membership_start
            membership_plan = update_data.get("membership_plan") or data.membership_plan
            if membership_end and member:
                await self.membership_service.renew_membership(
                    member=member,
                    new_end=membership_end,
                    new_start=membership_start,
                    plan=membership_plan,
                )

            # Generate invoice
            await self.invoice_service.generate_invoice(payment, gym_id)

            emit(PaymentRecorded(
                gym_id=gym_id,
                payment_id=payment.id,
                member_id=payment.member_id,
                amount_in_paise=payment.amount_in_paise,
                payment_method=payment.payment_method.value,
            ))

        # If completed payment's notes/method changed, update invoice
        if old_status == PaymentStatus.COMPLETED and new_status == PaymentStatus.COMPLETED:
            invoice = await self.invoice_service.get_invoice_by_payment(payment_id, gym_id)
            if invoice:
                if "notes" in update_data:
                    invoice.notes = update_data["notes"]
                if "payment_method" in update_data:
                    invoice.payment_method = update_data["payment_method"]
                await self.db.flush()

        # If pending payment had amount/plan/dates changed, update for future invoice
        if old_status == PaymentStatus.PENDING and new_status == PaymentStatus.PENDING:
            # No invoice exists yet for pending — nothing to update
            pass

        # Audit trail
        new_data = {
            "amount_in_paise": payment.amount_in_paise,
            "payment_method": payment.payment_method.value,
            "payment_status": payment.payment_status.value,
            "payment_date": str(payment.payment_date),
            "notes": payment.notes,
        }
        audit_entry = GymAuditLog(
            gym_id=gym_id,
            entity_type="payment",
            entity_id=payment_id,
            action=GymAuditAction.PAYMENT_EDITED,
            old_data=old_data,
            new_data=new_data,
            description=f"Payment edited. Status: {old_status.value} → {new_status.value}",
            performed_by=user_id,
        )
        self.db.add(audit_entry)
        await self.db.flush()

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

    async def void_payment(
        self, payment_id: UUID, gym_id: UUID, user_id: UUID, data: VoidPaymentRequest
    ) -> Payment:
        """
        Void a completed payment.

        Business rules:
        1. Payment must exist and belong to the gym
        2. Payment must be in COMPLETED status
        3. Cannot void already REFUNDED or FAILED payments
        4. Sets status to REFUNDED with full audit metadata
        5. Recomputes member financial totals from ledger
        6. Creates audit log entry
        """
        payment = await self.payment_repo.get_by_id(payment_id, gym_id)
        if not payment:
            raise NotFoundError("Payment not found")

        if payment.payment_status == PaymentStatus.REFUNDED:
            raise ValidationError("This payment has already been voided/refunded")

        if payment.payment_status == PaymentStatus.FAILED:
            raise ValidationError("Cannot void a failed payment")

        if payment.payment_status != PaymentStatus.COMPLETED:
            raise ValidationError(
                f"Only completed payments can be voided. Current status: {payment.payment_status.value}"
            )

        # Capture old state for audit
        old_status = payment.payment_status.value

        # Void the payment
        payment.payment_status = PaymentStatus.REFUNDED
        payment.voided_at = datetime.now(timezone.utc)
        payment.voided_by = user_id
        payment.void_reason = data.reason

        await self.db.flush()

        # Recompute member financial totals from ledger
        await self._recompute_member_financials(payment.member_id, gym_id, user_id)

        # Create audit log entry
        audit_entry = GymAuditLog(
            gym_id=gym_id,
            entity_type="payment",
            entity_id=payment_id,
            action=GymAuditAction.PAYMENT_VOIDED,
            old_data={"payment_status": old_status, "amount_in_paise": payment.amount_in_paise},
            new_data={
                "payment_status": PaymentStatus.REFUNDED.value,
                "void_reason": data.reason,
                "voided_at": payment.voided_at.isoformat(),
            },
            description=f"Payment of ₹{payment.amount_in_paise / 100:.2f} voided. Reason: {data.reason}",
            performed_by=user_id,
        )
        self.db.add(audit_entry)
        await self.db.flush()

        return payment

    async def _recompute_member_financials(self, member_id: UUID, gym_id: UUID, user_id: UUID | None = None) -> None:
        """
        Recompute member.amount_paid from the payment ledger.

        Logic: SUM(COMPLETED payments) — does NOT count REFUNDED/FAILED/PENDING.
        This prevents drift from manual adjustments and ensures ledger correctness.
        """
        member = await self.member_repo.get_by_id(member_id, gym_id)
        if not member:
            return

        # Compute total from ledger: only COMPLETED payments count
        result = await self.db.execute(
            select(func.coalesce(func.sum(Payment.amount_in_paise), 0)).where(
                Payment.member_id == member_id,
                Payment.gym_id == gym_id,
                Payment.payment_status == PaymentStatus.COMPLETED,
            )
        )
        total_paid = result.scalar_one()

        old_amount = member.amount_paid
        member.amount_paid = total_paid
        await self.db.flush()

        # Log recomputation if amounts changed
        if old_amount != total_paid:
            audit_entry = GymAuditLog(
                gym_id=gym_id,
                entity_type="member",
                entity_id=member_id,
                action=GymAuditAction.MEMBER_FINANCIAL_RECOMPUTE,
                old_data={"amount_paid": old_amount},
                new_data={"amount_paid": total_paid},
                description=f"Member financials recomputed from ledger. Old: ₹{old_amount / 100:.2f}, New: ₹{total_paid / 100:.2f}",
                performed_by=user_id or member_id,
            )
            self.db.add(audit_entry)
            await self.db.flush()
