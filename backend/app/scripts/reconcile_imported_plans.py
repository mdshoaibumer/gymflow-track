"""
Reconcile imported members with standard plan pricing.

1. Maps all non-standard plan names to the standard plans defined in the settings.
2. For members with blank plans, guesses the plan name based on the duration (end_date - start_date).
3. Sets the correct `amount_paid` for members who currently have 0 revenue.
4. Generates missing payment ledger entries and invoices.
"""

import asyncio
from datetime import datetime, timezone
import os
import sys

from sqlalchemy import select

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import app.main  # noqa
from app.core.database import async_session_factory
from app.core.timezone import today_ist
from app.models.member import Member
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.member_invoice import MemberInvoice
from app.services.invoice_service import InvoiceService

# Standard plans and pricing in paise (₹1 = 100 paise)
PLAN_PRICING = {
    "Monthly": 1000 * 100,
    "Quaterly": 2400 * 100,
    "Half-Yearly": 4400 * 100,
    "Yearly": 8000 * 100,
    "Monthly with Cardio": 1400 * 100,
    "Quaterly With Cardio": 3800 * 100,
    "Half-Yearly With Cardio": 7000 * 100,
    "Yearly With Cardio": 11000 * 100,
}

def standardize_plan(plan_name: str | None, start_date, end_date) -> tuple[str, int]:
    """Standardize plan name and lookup price, guessing from dates if blank."""
    plan_clean = (plan_name or "").strip().lower()
    
    # 1. Check for explicit keywords to map non-standard names
    has_cardio = "cardio" in plan_clean or "carddio" in plan_clean or "cardo" in plan_clean
    
    if has_cardio:
        if "half" in plan_clean or "6" in plan_clean:
            return "Half-Yearly With Cardio", PLAN_PRICING["Half-Yearly With Cardio"]
        elif "quat" in plan_clean or "3" in plan_clean:
            return "Quaterly With Cardio", PLAN_PRICING["Quaterly With Cardio"]
        elif "year" in plan_clean or "12" in plan_clean:
            return "Yearly With Cardio", PLAN_PRICING["Yearly With Cardio"]
        else:
            return "Monthly with Cardio", PLAN_PRICING["Monthly with Cardio"]
    else:
        if "half" in plan_clean or "6" in plan_clean:
            return "Half-Yearly", PLAN_PRICING["Half-Yearly"]
        elif "quat" in plan_clean or "3" in plan_clean:
            return "Quaterly", PLAN_PRICING["Quaterly"]
        elif "year" in plan_clean or "12" in plan_clean:
            return "Yearly", PLAN_PRICING["Yearly"]
        elif "month" in plan_clean or "normal" in plan_clean or "1month" in plan_clean:
            return "Monthly", PLAN_PRICING["Monthly"]

    # 2. If plan is blank, guess from membership dates duration
    if start_date and end_date:
        days = (end_date - start_date).days
        if days <= 45: # ~1 month
            return ("Monthly with Cardio", PLAN_PRICING["Monthly with Cardio"]) if has_cardio else ("Monthly", PLAN_PRICING["Monthly"])
        elif days <= 105: # ~3 months
            return ("Quaterly With Cardio", PLAN_PRICING["Quaterly With Cardio"]) if has_cardio else ("Quaterly", PLAN_PRICING["Quaterly"])
        elif days <= 200: # ~6 months
            return ("Half-Yearly With Cardio", PLAN_PRICING["Half-Yearly With Cardio"]) if has_cardio else ("Half-Yearly", PLAN_PRICING["Half-Yearly"])
        else: # ~1 year
            return ("Yearly With Cardio", PLAN_PRICING["Yearly With Cardio"]) if has_cardio else ("Yearly", PLAN_PRICING["Yearly"])

    # Default fallback
    return "Monthly", PLAN_PRICING["Monthly"]


async def run_plan_reconciliation():
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("Running in DRY RUN mode. No changes will be committed.\n")
    else:
        print("Running in LIVE mode. Changes will be committed.\n")

    invoice_service = InvoiceService(session=None) # We will set session dynamically
    
    async with async_session_factory() as session:
        invoice_service.db = session
        async with session.begin():
            members_stmt = select(Member).where(Member.is_deleted.is_(False))
            result = await session.execute(members_stmt)
            members = result.scalars().all()
            
            print(f"Loaded {len(members)} active members.")
            
            plans_standardized = 0
            payments_created = 0
            payments_updated = 0
            
            for member in members:
                # 1. Standardize/Guess Plan and Price
                old_plan = member.membership_plan
                new_plan, expected_price = standardize_plan(
                    old_plan, member.membership_start, member.membership_end
                )
                
                # Update plan name if it changed or was empty
                plan_changed = False
                if old_plan != new_plan:
                    member.membership_plan = new_plan
                    member.version += 1
                    plan_changed = True
                    plans_standardized += 1
                
                # If they have 0 revenue recorded, update amount_paid to standard plan price
                amount_changed = False
                if member.amount_paid == 0:
                    member.amount_paid = expected_price
                    member.version += 1
                    amount_changed = True
                
                if plan_changed or amount_changed:
                    print(f"[ALIGN] {member.name} - Plan: '{old_plan or 'None'}' -> '{new_plan}' | Amount Paid: \u20b9{member.amount_paid/100:.2f}")
                
                # 2. Check Completed Payments
                payments_stmt = select(Payment).where(
                    Payment.member_id == member.id,
                    Payment.payment_status == PaymentStatus.COMPLETED
                )
                p_result = await session.execute(payments_stmt)
                payments = p_result.scalars().all()
                
                # Case A: Member now has amount_paid > 0 but has NO completed payment
                if member.amount_paid > 0 and len(payments) == 0:
                    payment_notes = f"Plan: {member.membership_plan} | Duration: {member.membership_start or 'N/A'} to {member.membership_end or 'N/A'} (Reconciled from Settings)"
                    new_payment = Payment(
                        gym_id=member.gym_id,
                        member_id=member.id,
                        amount_in_paise=member.amount_paid,
                        discount_in_paise=0,
                        payment_method=PaymentMethod.CASH,
                        payment_status=PaymentStatus.COMPLETED,
                        payment_date=member.membership_start or today_ist(),
                        notes=payment_notes,
                    )
                    session.add(new_payment)
                    await session.flush()
                    
                    try:
                        await invoice_service.generate_invoice(new_payment, member.gym_id)
                    except Exception as e:
                        print(f"  Warning: Invoice generation failed for {member.name}: {e}")
                        
                    payments_created += 1
                    print(f"  [NEW PAYMENT] Created \u20b9{member.amount_paid/100:.2f} payment & invoice for {member.name}")
                
                # Case B: Member has exactly 1 completed payment, align it
                elif len(payments) == 1:
                    payment = payments[0]
                    has_mismatch = False
                    
                    if payment.amount_in_paise != member.amount_paid:
                        payment.amount_in_paise = member.amount_paid
                        has_mismatch = True
                        
                    if member.membership_start and payment.payment_date != member.membership_start:
                        payment.payment_date = member.membership_start
                        has_mismatch = True
                        
                    expected_notes = f"Plan: {member.membership_plan} | Duration: {member.membership_start or 'N/A'} to {member.membership_end or 'N/A'}"
                    if payment.notes != expected_notes:
                        payment.notes = expected_notes
                        has_mismatch = True
                        
                    if has_mismatch:
                        payment.updated_at = datetime.now(timezone.utc)
                        payments_updated += 1
                        print(f"  [UPDATE PAYMENT] Aligned payment & notes for {member.name}")
                        
                        # Sync linked invoice
                        invoice_stmt = select(MemberInvoice).where(MemberInvoice.payment_id == payment.id)
                        inv_res = await session.execute(invoice_stmt)
                        invoice = inv_res.scalar_one_or_none()
                        if invoice:
                            invoice.amount_in_paise = payment.amount_in_paise
                            invoice.payment_date = payment.payment_date
                            invoice.plan_name = member.membership_plan
                            invoice.notes = payment.notes
                        else:
                            try:
                                await invoice_service.generate_invoice(payment, member.gym_id)
                            except Exception as e:
                                print(f"  Warning: Invoice creation failed for {member.name}: {e}")
            
            print("\nReconciliation completed!")
            print(f"  - Plans standardized/corrected: {plans_standardized}")
            print(f"  - New payment records created: {payments_created}")
            print(f"  - Existing payment records aligned: {payments_updated}")
            
            if dry_run:
                print("\n[DRY RUN] Rolling back all changes.")
                raise RuntimeError("DRY_RUN_ROLLBACK")


if __name__ == "__main__":
    try:
        asyncio.run(run_plan_reconciliation())
    except RuntimeError as e:
        if str(e) == "DRY_RUN_ROLLBACK":
            print("\nDry run completed successfully. No changes were committed.")
        else:
            raise e
