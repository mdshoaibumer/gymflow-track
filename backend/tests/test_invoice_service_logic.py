import pytest
from unittest.mock import AsyncMock, MagicMock

from app.services.invoice_service import InvoiceService
from app.models.member_invoice import MemberInvoice


@pytest.mark.asyncio
async def test_get_recorded_by_name_with_user():
    """Test that it returns the name of the user who recorded the payment."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = "Staff Name"
    mock_db.execute.return_value = mock_result
    
    service = InvoiceService(mock_db)
    invoice = MemberInvoice(payment_id="00000000-0000-0000-0000-000000000000", gym_id="11111111-1111-1111-1111-111111111111")
    
    name = await service.get_recorded_by_name(invoice)
    assert name == "Staff Name"
    

@pytest.mark.asyncio
async def test_get_recorded_by_name_fallback():
    """Test that it falls back to the gym owner if payment user is not found."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result
    
    service = InvoiceService(mock_db)
    service.get_owner_name = AsyncMock(return_value="Gym Owner")
    
    invoice = MemberInvoice(payment_id="00000000-0000-0000-0000-000000000000", gym_id="11111111-1111-1111-1111-111111111111")
    
    name = await service.get_recorded_by_name(invoice)
    assert name == "Gym Owner"
