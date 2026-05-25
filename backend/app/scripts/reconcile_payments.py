"""
Reconcile members and payments tables.

For active members:
1. If member.amount_paid > 0 but has 0 completed payments:
   - Create a completed payment record.
   - Generate a matching invoice record.
2. If member has exactly 1 completed payment:
   - If payment amount, date, or notes mismatch member's details, update the payment.
   - Ensure a matching invoice exists and matches.
3. If member has multiple completed payments:
   - Sum the completed payments.
   - If the sum mismatches member.amount_paid, update member.amount_paid to match the payments sum (ledger is source of truth).
"""

import asyncio
from datetime import datetime, timezone
import os
import sys

from sqlalchemy import select

# Add parent directory to path so app can be imported
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Trigger all model imports
import app.main  # noqa
from app.core.database import async_session_factory
from app.core.timezone import today_ist
from app.models.member import Member
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.member_invoice import MemberInvoice
from app.services.invoice_service import InvoiceService


async def reconcile_payments():
    print("Starting database reconciliation...")
    async with async_session_factory() as session:
        async with session.begin():
            # Get all active members
            members_stmt = select(Member).where(Member.is_deleted.is_(False))
            result = await session.execute(members_stmt)
            members = result.scalars().all()
            
            print(f"Loaded {len(members)} active members.")
            
            created_count = 0
            updated_payments = 0
            updated_members = 0
            invoice_service = InvoiceService(session)
            
            for member in members:
                # Get completed payments for this member
                payments_stmt = select(Payment).where(
                    Payment.member_id == member.id,
                    Payment.payment_status == PaymentStatus.COMPLETED
                )
                p_result = await session.execute(payments_stmt)
                payments = p_result.scalars().all()
                
                # Case 1: Paid money in members table, but no payment record in database
                if member.amount_paid > 0 and len(payments) == 0:
                    payment_notes = f"Plan: {member.membership_plan or 'N/A'} | Duration: {member.membership_start or 'N/A'} to {member.membership_end or 'N/A'} (Reconciled from Excel import)"
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
                    
                    # Generate invoice for the new payment
                    try:
                        await invoice_service.generate_invoice(new_payment, member.gym_id)
                    except Exception as e:
                        print(f"Warning: Failed to generate invoice for new payment of {member.name}: {e}")
                        
                    created_count += 1
                    print(f"[NEW PAYMENT] {member.name} ({member.email or 'No Email'}) - Created payment of \u20b9{member.amount_paid / 100:.2f}")
                
                # Case 2: Exactly 1 payment, but details mismatch
                elif len(payments) == 1:
                    payment = payments[0]
                    has_mismatch = False
                    
                    # Check amount mismatch
                    if payment.amount_in_paise != member.amount_paid:
                        print(f"[MISMATCH] {member.name} - Payment: \u20b9{payment.amount_in_paise/100:.2f}, Member Page: \u20b9{member.amount_paid/100:.2f}. Aligning payment.")
                        payment.amount_in_paise = member.amount_paid
                        has_mismatch = True
                        
                    # Check start date / payment date mismatch
                    if member.membership_start and payment.payment_date != member.membership_start:
                        payment.payment_date = member.membership_start
                        has_mismatch = True
                        
                    # Check/Update notes to include plan & dates if missing
                    expected_notes = f"Plan: {member.membership_plan or 'N/A'} | Duration: {member.membership_start or 'N/A'} to {member.membership_end or 'N/A'}"
                    if not payment.notes or "Plan:" not in payment.notes:
                        payment.notes = expected_notes
                        has_mismatch = True
                        
                    if has_mismatch:
                        payment.updated_at = datetime.now(timezone.utc)
                        updated_payments += 1
                        
                        # Find and update or generate invoice
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
                                print(f"Warning: Failed to generate invoice for updated payment of {member.name}: {e}")
                                
                # Case 3: Multiple payments exist. Ledger is source of truth.
                elif len(payments) > 1:
                    total_payments_sum = sum(p.amount_in_paise for p in payments)
                    if member.amount_paid != total_payments_sum:
                        print(f"[MISMATCH] {member.name} (Multi-payment) - Member Page: \u20b9{member.amount_paid/100:.2f}, Payments Sum: \u20b9{total_payments_sum/100:.2f}. Aligning Member Page to match payments ledger.")
                        member.amount_paid = total_payments_sum
                        member.version += 1
                        updated_members += 1
                        
            print("\nReconciliation completed!")
            print(f"  - New payment records created: {created_count}")
            print(f"  - Existing payment records corrected: {updated_payments}")
            print(f"  - Member page records updated from ledger: {updated_members}")


if __name__ == "__main__":
    asyncio.run(reconcile_payments())
