"""
Invoice service — generates and retrieves member payment invoices.

Handles:
- Auto-generation of invoice on payment
- Unique sequential invoice numbers per gym
- PDF generation using reportlab
- Invoice retrieval and listing
"""

import io
import logging
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.timezone import today_ist
from app.models.gym import Gym
from app.models.member import Member
from app.models.member_invoice import MemberInvoice
from app.models.payment import Payment

logger = logging.getLogger("gymflow.invoices")


class InvoiceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_invoice(self, payment: Payment, gym_id: UUID) -> MemberInvoice:
        """
        Create an invoice record for a completed payment.
        Snapshots gym and member data at the time of invoice creation.
        """
        # Load gym and member details for snapshot
        gym = await self.db.get(Gym, gym_id)
        member = await self.db.get(Member, payment.member_id)

        if not gym or not member:
            raise NotFoundError("Gym or member not found for invoice generation")

        # Generate sequential invoice number for this gym
        invoice_number = await self._next_invoice_number(gym_id)

        invoice = MemberInvoice(
            gym_id=gym_id,
            payment_id=payment.id,
            member_id=payment.member_id,
            invoice_number=invoice_number,
            invoice_date=today_ist(),
            gym_name=gym.name,
            gym_address=gym.address,
            gym_phone=gym.phone,
            gym_logo_url=getattr(gym, "logo_url", None),
            member_name=member.name,
            member_phone=member.phone,
            amount_in_paise=payment.amount_in_paise,
            payment_method=payment.payment_method,
            payment_date=payment.payment_date,
            plan_name=member.membership_plan,
            notes=payment.notes,
        )
        self.db.add(invoice)
        await self.db.flush()
        logger.info(f"Invoice {invoice_number} generated for payment {payment.id}")
        return invoice

    async def get_invoice(self, invoice_id: UUID, gym_id: UUID) -> MemberInvoice:
        """Get a single invoice by ID."""
        stmt = select(MemberInvoice).where(
            MemberInvoice.id == invoice_id,
            MemberInvoice.gym_id == gym_id,
        )
        result = await self.db.execute(stmt)
        invoice = result.scalar_one_or_none()
        if not invoice:
            raise NotFoundError("Invoice not found")
        return invoice

    async def get_invoice_by_payment(self, payment_id: UUID, gym_id: UUID) -> MemberInvoice | None:
        """Get invoice for a specific payment."""
        stmt = select(MemberInvoice).where(
            MemberInvoice.payment_id == payment_id,
            MemberInvoice.gym_id == gym_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_member_invoices(
        self, gym_id: UUID, member_id: UUID, skip: int = 0, limit: int = 50
    ) -> tuple[list[MemberInvoice], int]:
        """List invoices for a specific member."""
        base = select(MemberInvoice).where(
            MemberInvoice.gym_id == gym_id,
            MemberInvoice.member_id == member_id,
        )
        count_stmt = select(func.count()).select_from(base.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0

        stmt = base.order_by(MemberInvoice.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def list_gym_invoices(
        self, gym_id: UUID, skip: int = 0, limit: int = 50
    ) -> tuple[list[MemberInvoice], int]:
        """List all invoices for a gym."""
        base = select(MemberInvoice).where(MemberInvoice.gym_id == gym_id)
        count_stmt = select(func.count()).select_from(base.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0

        stmt = base.order_by(MemberInvoice.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    def generate_pdf(self, invoice: MemberInvoice) -> bytes:
        """Generate a PDF invoice using reportlab."""
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
        styles = getSampleStyleSheet()

        # Custom styles
        title_style = ParagraphStyle(
            "InvoiceTitle", parent=styles["Heading1"], fontSize=22, alignment=TA_CENTER
        )
        gym_style = ParagraphStyle(
            "GymName", parent=styles["Heading2"], fontSize=16, alignment=TA_CENTER
        )

        elements = []

        # Gym header
        elements.append(Paragraph(invoice.gym_name, gym_style))
        if invoice.gym_address:
            elements.append(Paragraph(invoice.gym_address, ParagraphStyle("Addr", parent=styles["Normal"], alignment=TA_CENTER)))
        if invoice.gym_phone:
            elements.append(Paragraph(f"Phone: {invoice.gym_phone}", ParagraphStyle("Phone", parent=styles["Normal"], alignment=TA_CENTER)))
        elements.append(Spacer(1, 10 * mm))

        # Invoice title
        elements.append(Paragraph("INVOICE", title_style))
        elements.append(Spacer(1, 5 * mm))

        # Invoice meta
        meta_data = [
            ["Invoice No:", invoice.invoice_number],
            ["Invoice Date:", invoice.invoice_date.strftime("%d %b %Y")],
            ["Payment Date:", invoice.payment_date.strftime("%d %b %Y")],
        ]
        meta_table = Table(meta_data, colWidths=[80 * mm, 80 * mm])
        meta_table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 8 * mm))

        # Member details
        elements.append(Paragraph("<b>Bill To:</b>", styles["Normal"]))
        elements.append(Paragraph(invoice.member_name, styles["Normal"]))
        elements.append(Paragraph(f"Phone: {invoice.member_phone}", styles["Normal"]))
        elements.append(Spacer(1, 8 * mm))

        # Line items table
        amount_rupees = invoice.amount_in_paise / 100
        items_data = [
            ["Description", "Amount (₹)"],
            [invoice.plan_name or "Membership Payment", f"₹{amount_rupees:,.2f}"],
        ]
        items_table = Table(items_data, colWidths=[120 * mm, 40 * mm])
        items_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 11),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 5 * mm))

        # Total
        total_data = [["Total:", f"₹{amount_rupees:,.2f}"]]
        total_table = Table(total_data, colWidths=[120 * mm, 40 * mm])
        total_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 12),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("LINEABOVE", (0, 0), (-1, 0), 1, colors.black),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(total_table)
        elements.append(Spacer(1, 5 * mm))

        # Payment method
        method_display = invoice.payment_method.value.replace("_", " ").title()
        elements.append(Paragraph(f"<b>Payment Mode:</b> {method_display}", styles["Normal"]))

        if invoice.notes:
            elements.append(Spacer(1, 3 * mm))
            elements.append(Paragraph(f"<b>Notes:</b> {invoice.notes}", styles["Normal"]))

        elements.append(Spacer(1, 15 * mm))
        elements.append(Paragraph("Thank you for your payment!", ParagraphStyle("Thanks", parent=styles["Normal"], alignment=TA_CENTER, fontSize=11)))

        doc.build(elements)
        return buffer.getvalue()

    async def _next_invoice_number(self, gym_id: UUID) -> str:
        """Generate next sequential invoice number for the gym."""
        current_year = today_ist().year

        # Count existing invoices this year for this gym
        prefix = f"INV-{current_year}-"
        stmt = select(func.count()).where(
            MemberInvoice.gym_id == gym_id,
            MemberInvoice.invoice_number.like(f"{prefix}%"),
        )
        count = (await self.db.execute(stmt)).scalar() or 0
        next_num = count + 1
        return f"{prefix}{next_num:04d}"
