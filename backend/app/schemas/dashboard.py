from datetime import date
from uuid import UUID

from pydantic import BaseModel

from app.models.member import MembershipStatus
from app.models.payment import PaymentMethod, PaymentStatus


class DashboardMetrics(BaseModel):
    """Aggregated dashboard metrics — computed in single efficient pass."""

    total_members: int
    active_members: int
    expiring_soon: int  # within 7 days
    expired_members: int
    pending_dues_count: int
    monthly_revenue_paise: int  # current month


class ExpiringMemberResponse(BaseModel):
    id: UUID
    name: str
    phone: str
    membership_plan: str | None
    membership_end: date | None

    model_config = {"from_attributes": True}


class RecentPaymentResponse(BaseModel):
    id: UUID
    member_id: UUID
    amount_in_paise: int
    payment_method: PaymentMethod
    payment_date: date

    model_config = {"from_attributes": True}
