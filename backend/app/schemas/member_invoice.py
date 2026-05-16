"""Pydantic schemas for member invoices."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel


class InvoiceResponse(BaseModel):
    """Full invoice data returned to client for rendering/printing."""
    id: UUID
    invoice_number: str
    invoice_date: date

    gym_name: str
    gym_address: str | None = None
    gym_phone: str | None = None
    gym_logo_url: str | None = None

    member_name: str
    member_phone: str

    amount_in_paise: int
    payment_method: str
    payment_date: date
    plan_name: str | None = None
    notes: str | None = None

    created_at: str  # ISO datetime

    model_config = {"from_attributes": True}


class InvoiceListResponse(BaseModel):
    """Paginated list of invoices."""
    invoices: list[InvoiceResponse]
    total: int
