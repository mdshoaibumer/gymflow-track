"""Pydantic schemas for gym membership plans."""
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field


class MembershipPlanCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    duration_months: int = Field(..., ge=1, le=60)
    amount: int = Field(..., ge=1, description="Amount in rupees")


class MembershipPlanUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    duration_months: int | None = Field(None, ge=1, le=60)
    amount: int | None = Field(None, ge=1)
    is_active: bool | None = None


class MembershipPlanResponse(BaseModel):
    id: UUID
    name: str
    duration_months: int
    amount: int
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class MembershipPlanListResponse(BaseModel):
    plans: list[MembershipPlanResponse]
