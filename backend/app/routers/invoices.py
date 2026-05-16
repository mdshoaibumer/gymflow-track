"""Invoice endpoints — download/view member payment invoices."""

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
import io

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_and_gym
from app.schemas.member_invoice import InvoiceResponse, InvoiceListResponse
from app.services.invoice_service import InvoiceService

router = APIRouter()


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: UUID,
    user_gym=Depends(get_current_user_and_gym),
    db: AsyncSession = Depends(get_db),
):
    """Get invoice data (for printable HTML rendering)."""
    user, gym_id = user_gym
    service = InvoiceService(db)
    invoice = await service.get_invoice(invoice_id, gym_id)
    return invoice


@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: UUID,
    user_gym=Depends(get_current_user_and_gym),
    db: AsyncSession = Depends(get_db),
):
    """Download invoice as PDF."""
    user, gym_id = user_gym
    service = InvoiceService(db)
    invoice = await service.get_invoice(invoice_id, gym_id)
    pdf_bytes = service.generate_pdf(invoice)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{invoice.invoice_number}.pdf"'
        },
    )


@router.get("/payments/{payment_id}/invoice", response_model=InvoiceResponse)
async def get_invoice_by_payment(
    payment_id: UUID,
    user_gym=Depends(get_current_user_and_gym),
    db: AsyncSession = Depends(get_db),
):
    """Get invoice associated with a specific payment."""
    user, gym_id = user_gym
    service = InvoiceService(db)
    invoice = await service.get_invoice_by_payment(payment_id, gym_id)
    if not invoice:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("No invoice found for this payment")
    return invoice


@router.get("/members/{member_id}/invoices", response_model=InvoiceListResponse)
async def list_member_invoices(
    member_id: UUID,
    skip: int = 0,
    limit: int = 50,
    user_gym=Depends(get_current_user_and_gym),
    db: AsyncSession = Depends(get_db),
):
    """List all invoices for a specific member."""
    user, gym_id = user_gym
    service = InvoiceService(db)
    invoices, total = await service.list_member_invoices(gym_id, member_id, skip, limit)
    return InvoiceListResponse(invoices=invoices, total=total)


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    skip: int = 0,
    limit: int = 50,
    user_gym=Depends(get_current_user_and_gym),
    db: AsyncSession = Depends(get_db),
):
    """List all invoices for the gym."""
    user, gym_id = user_gym
    service = InvoiceService(db)
    invoices, total = await service.list_gym_invoices(gym_id, skip, limit)
    return InvoiceListResponse(invoices=invoices, total=total)
