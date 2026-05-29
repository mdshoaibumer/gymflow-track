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

    async def get_invoice(self, invoice_id: UUID, gym_id: UUID | None = None) -> MemberInvoice:
        """Get a single invoice by ID."""
        stmt = select(MemberInvoice).where(MemberInvoice.id == invoice_id)
        if gym_id is not None:
            stmt = stmt.where(MemberInvoice.gym_id == gym_id)
        result = await self.db.execute(stmt)
        invoice = result.scalar_one_or_none()
        if not invoice:
            raise NotFoundError("Invoice not found")
        return invoice

    async def get_invoice_by_payment(self, payment_id: UUID, gym_id: UUID | None = None) -> MemberInvoice | None:
        """Get invoice for a specific payment."""
        stmt = select(MemberInvoice).where(MemberInvoice.payment_id == payment_id)
        if gym_id is not None:
            stmt = stmt.where(MemberInvoice.gym_id == gym_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_member_invoices(
        self, gym_id: UUID | None, member_id: UUID, skip: int = 0, limit: int = 50
    ) -> tuple[list[MemberInvoice], int]:
        """List invoices for a specific member."""
        base = select(MemberInvoice).where(MemberInvoice.member_id == member_id)
        if gym_id is not None:
            base = base.where(MemberInvoice.gym_id == gym_id)
        count_stmt = select(func.count()).select_from(base.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0

        stmt = base.order_by(MemberInvoice.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def list_gym_invoices(
        self, gym_id: UUID | None, skip: int = 0, limit: int = 50
    ) -> tuple[list[MemberInvoice], int]:
        """List all invoices for a gym."""
        base = select(MemberInvoice)
        if gym_id is not None:
            base = base.where(MemberInvoice.gym_id == gym_id)
        count_stmt = select(func.count()).select_from(base.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0

        stmt = base.order_by(MemberInvoice.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def get_owner_name(self, gym_id: UUID) -> str:
        """Fetch the gym owner's name, falling back to first user or Admin."""
        from app.models.user import User, UserRole
        stmt = select(User).where(User.gym_id == gym_id, User.role == UserRole.OWNER)
        result = await self.db.execute(stmt)
        owner = result.scalar_one_or_none()
        if not owner:
            # Fall back to first user
            stmt = select(User).where(User.gym_id == gym_id).order_by(User.created_at.asc()).limit(1)
            result = await self.db.execute(stmt)
            owner = result.scalar_one_or_none()
        return owner.name if owner else "Admin"

    async def get_recorded_by_name(self, invoice: MemberInvoice) -> str:
        """Fetch the name of the user who recorded the payment, falling back to owner name."""
        from app.models.user import User
        from app.models.payment import Payment
        stmt = (
            select(User.name)
            .select_from(Payment)
            .join(User, Payment.created_by == User.id)
            .where(Payment.id == invoice.payment_id)
        )
        result = await self.db.execute(stmt)
        name = result.scalar_one_or_none()
        if not name:
            name = await self.get_owner_name(invoice.gym_id)
        return name

    def generate_pdf(self, invoice: MemberInvoice, owner_name: str | None = None) -> bytes:
        """Generate a premium PDF invoice matching the layout and design of 1.webp."""
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, KeepTogether
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_RIGHT
        from datetime import timedelta
        import os

        buffer = io.BytesIO()
        
        # A4 Page is 210mm x 297mm.
        # Margins: 20mm left/right, 25mm top, 25mm bottom to clear the red bands nicely.
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=A4, 
            leftMargin=20 * mm, 
            rightMargin=20 * mm, 
            topMargin=25 * mm, 
            bottomMargin=25 * mm
        )
        
        styles = getSampleStyleSheet()

        # Premium Typography & Custom Styles
        gym_address_style = ParagraphStyle(
            "GymAddress", 
            parent=styles["Normal"], 
            fontSize=9, 
            leading=12, 
            textColor=colors.HexColor("#555555"),
            fontName="Helvetica",
            alignment=1  # TA_CENTER
        )
        member_addr_style = ParagraphStyle(
            "MemberAddress", 
            parent=styles["Normal"], 
            fontSize=9, 
            leading=12, 
            textColor=colors.HexColor("#555555"),
            fontName="Helvetica"
        )
        meta_label_style = ParagraphStyle(
            "MetaLabel", 
            parent=styles["Normal"], 
            fontSize=10, 
            leading=14, 
            textColor=colors.HexColor("#444444"),
            fontName="Helvetica-Bold",
            alignment=TA_RIGHT
        )
        meta_val_style = ParagraphStyle(
            "MetaVal", 
            parent=styles["Normal"], 
            fontSize=10, 
            leading=14, 
            textColor=colors.HexColor("#111111"),
            fontName="Helvetica",
            alignment=TA_RIGHT
        )
        total_label_style = ParagraphStyle(
            "TotalLabel", 
            parent=styles["Normal"], 
            fontSize=22, 
            leading=26, 
            textColor=colors.HexColor("#111111"),
            fontName="Helvetica-Bold"
        )
        total_amount_style = ParagraphStyle(
            "TotalAmount", 
            parent=styles["Normal"], 
            fontSize=22, 
            leading=26, 
            textColor=colors.HexColor("#111111"),
            fontName="Helvetica-Bold",
            alignment=TA_RIGHT
        )
        th_style = ParagraphStyle(
            "TableHeader", 
            parent=styles["Normal"], 
            fontSize=10, 
            leading=12, 
            textColor=colors.HexColor("#111111"),
            fontName="Helvetica-Bold"
        )
        th_right_style = ParagraphStyle(
            "TableHeaderRight", 
            parent=th_style, 
            alignment=TA_RIGHT
        )
        td_desc_style = ParagraphStyle(
            "TableDesc", 
            parent=styles["Normal"], 
            fontSize=10, 
            leading=13, 
            textColor=colors.HexColor("#111111"),
            fontName="Helvetica"
        )
        td_amount_style = ParagraphStyle(
            "TableAmount", 
            parent=styles["Normal"], 
            fontSize=10, 
            leading=13, 
            textColor=colors.HexColor("#111111"),
            fontName="Helvetica-Bold",
            alignment=TA_RIGHT
        )
        subtotal_label_style = ParagraphStyle(
            "SubtotalLabel", 
            parent=styles["Normal"], 
            fontSize=10, 
            leading=12, 
            textColor=colors.HexColor("#555555"),
            fontName="Helvetica-Bold",
            alignment=TA_RIGHT
        )
        subtotal_val_style = ParagraphStyle(
            "SubtotalVal", 
            parent=styles["Normal"], 
            fontSize=10, 
            leading=12, 
            textColor=colors.HexColor("#111111"),
            fontName="Helvetica-Bold",
            alignment=TA_RIGHT
        )
        sale_by_style = ParagraphStyle(
            "SaleBy", 
            parent=styles["Normal"], 
            fontSize=9, 
            leading=12, 
            textColor=colors.HexColor("#777777"),
            fontName="Helvetica-Bold"
        )
        terms_title_style = ParagraphStyle(
            "TermsTitle", 
            parent=styles["Normal"], 
            fontSize=11, 
            leading=14, 
            textColor=colors.HexColor("#111111"),
            fontName="Helvetica-Bold"
        )
        terms_text_style = ParagraphStyle(
            "TermsText", 
            parent=styles["Normal"], 
            fontSize=9, 
            leading=12, 
            textColor=colors.HexColor("#555555"),
            fontName="Helvetica"
        )

        elements = []

        # ------------------ Gym Header ------------------
        # Try to resolve and load the gym logo
        logo_img = None
        if invoice.gym_logo_url:
            clean_url = invoice.gym_logo_url.lstrip("/")
            if clean_url.startswith("uploads/"):
                clean_url = clean_url[len("uploads/"):]
            
            paths_to_try = [
                os.path.join("/app/uploads", clean_url),
                os.path.join("uploads", clean_url),
                os.path.join(".", clean_url),
            ]
            for p in paths_to_try:
                if os.path.exists(p) and os.path.isfile(p):
                    try:
                        # Limit logo height to 18mm while keeping aspect ratio
                        logo_img = Image(p, height=18 * mm, width=45 * mm, kind='proportional')
                        logo_img.hAlign = 'CENTER'
                        break
                    except Exception as e:
                        logger.error(f"Error loading logo image: {e}")
                        
        # Fallback placeholder image logo if no custom logo is present
        if not logo_img:
            default_logo_paths = [
                "/app/app/assets/default_logo.png",
                "app/assets/default_logo.png",
                "./backend/app/assets/default_logo.png",
            ]
            for p in default_logo_paths:
                if os.path.exists(p) and os.path.isfile(p):
                    try:
                        logo_img = Image(p, height=18 * mm, width=45 * mm, kind='proportional')
                        logo_img.hAlign = 'CENTER'
                        break
                    except Exception as e:
                        logger.error(f"Error loading default logo image: {e}")

        # Final fallback typographic logo if still no logo is loaded
        if not logo_img:
            fallback_text = f"<b>{invoice.gym_name.upper()}</b>"
            fallback_style = ParagraphStyle(
                "FallbackLogo", 
                parent=styles["Normal"], 
                fontSize=13, 
                leading=15, 
                textColor=colors.HexColor("#D32F2F"),
                fontName="Helvetica-Bold",
                alignment=1  # TA_CENTER
            )
            logo_img = Paragraph(fallback_text, fallback_style)

        # Gym Name and Address in Left, Logo in Right
        gym_info_html = f"<b>{invoice.gym_name.upper()}</b>"
        if invoice.gym_address:
            gym_info_html += f"<br/>{invoice.gym_address}"
        if invoice.gym_phone:
            gym_info_html += f"<br/>Phone: {invoice.gym_phone}"
            
        header_p = Paragraph(gym_info_html, gym_address_style)
        
        elements.append(logo_img)
        elements.append(Spacer(1, 4 * mm))
        elements.append(header_p)
        elements.append(Spacer(1, 10 * mm))

        # ------------------ Bill To & Invoice Meta ------------------
        # Left side: BILL TO
        bill_to_p = Paragraph(
            f"<font color='#555555'><b>BILL TO</b></font><br/><b>{invoice.member_name}</b><br/>{invoice.member_phone}",
            member_addr_style
        )
        
        # Right side: Invoice Meta
        inv_date_str = invoice.invoice_date.strftime("%d-%b-%Y")
        meta_html_labels = "<b>INVOICE #</b><br/><b>INVOICE DATE</b>"
        meta_html_vals = f"{invoice.invoice_number}<br/>{inv_date_str}"
        
        meta_lbl_p = Paragraph(meta_html_labels, meta_label_style)
        meta_val_p = Paragraph(meta_html_vals, meta_val_style)
        
        meta_right_table = Table([[meta_lbl_p, meta_val_p]], colWidths=[30 * mm, 30 * mm])
        meta_right_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
        ]))

        meta_container_table = Table([[bill_to_p, meta_right_table]], colWidths=[110 * mm, 60 * mm])
        meta_container_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(meta_container_table)
        elements.append(Spacer(1, 8 * mm))

        # ------------------ Invoice Total Banner ------------------
        amount_rupees = invoice.amount_in_paise / 100
        total_lbl = Paragraph("Invoice Total", total_label_style)
        total_val = Paragraph(f"Rs. {amount_rupees:,.2f}", total_amount_style)
        
        total_banner = Table([[total_lbl, total_val]], colWidths=[85 * mm, 85 * mm])
        total_banner.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LINEABOVE", (0, 0), (-1, -1), 1.5, colors.HexColor("#111111")),
            ("LINEBELOW", (0, 0), (-1, -1), 1.5, colors.HexColor("#111111")),
            ("TOPPADDING", (0, 0), (-1, -1), 12),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(total_banner)
        elements.append(Spacer(1, 8 * mm))

        # ------------------ Line Items Table ------------------
        duration_days = 30
        plan_lower = (invoice.plan_name or "").lower()
        if "6 month" in plan_lower:
            duration_days = 180
        elif "3 month" in plan_lower:
            duration_days = 90
        elif "12 month" in plan_lower or "year" in plan_lower:
            duration_days = 365
        
        start_date = invoice.invoice_date
        end_date = start_date + timedelta(days=duration_days)
        start_str = start_date.strftime("%d-%b-%Y")
        end_str = end_date.strftime("%d-%b-%Y")

        th_sr = Paragraph("SR. NO.", th_style)
        th_desc = Paragraph("DESCRIPTION", th_style)
        th_amt = Paragraph("AMOUNT", th_right_style)

        td_sr = Paragraph("1", td_desc_style)
        plan_display = (invoice.plan_name or "Membership Payment").upper()
        desc_html = f"<b>{plan_display}</b><br/><font color='#777777' size='8'><i>{start_str} to {end_str}</i></font>"
        td_desc = Paragraph(desc_html, td_desc_style)
        td_amt = Paragraph(f"Rs. {amount_rupees:,.2f}", td_amount_style)

        items_data = [
            [th_sr, th_desc, th_amt],
            [td_sr, td_desc, td_amt]
        ]
        
        items_table = Table(items_data, colWidths=[20 * mm, 115 * mm, 35 * mm])
        items_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#111111")),
            ("LINEBELOW", (0, 1), (-1, 1), 1, colors.HexColor("#E5E7EB")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 4 * mm))

        # ------------------ Subtotal ------------------
        subtotal_lbl = Paragraph("SUB TOTAL", subtotal_label_style)
        subtotal_val = Paragraph(f"Rs. {amount_rupees:,.2f}", subtotal_val_style)
        
        subtotal_table = Table([["", subtotal_lbl, subtotal_val]], colWidths=[100 * mm, 35 * mm, 35 * mm])
        subtotal_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(subtotal_table)
        elements.append(Spacer(1, 12 * mm))

        # ------------------ Footer Block ------------------
        sale_by_name = owner_name or "ADMIN"
        sale_by_p = Paragraph(f"<font color='#777777'>SALE BY : </font>{sale_by_name.upper()}", sale_by_style)
        
        terms_lbl = Paragraph("TERMS & CONDITIONS", terms_title_style)
        terms_val = Paragraph("Terms and conditions apply", terms_text_style)
        
        footer_block = KeepTogether([
            sale_by_p,
            Spacer(1, 8 * mm),
            terms_lbl,
            Spacer(1, 2 * mm),
            terms_val
        ])
        elements.append(footer_block)

        def draw_red_bands(canvas, doc):
            canvas.saveState()
            canvas.setFillColor(colors.HexColor("#D32F2F"))
            canvas.rect(0, 285 * mm, 210 * mm, 12 * mm, stroke=0, fill=1)
            canvas.rect(0, 0, 210 * mm, 12 * mm, stroke=0, fill=1)
            canvas.restoreState()

        doc.build(elements, onFirstPage=draw_red_bands, onLaterPages=draw_red_bands)
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
