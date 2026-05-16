"""Pydantic schemas for custom field definitions."""
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field


class CustomFieldCreateRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    field_type: str = Field(default="text", pattern=r"^(text|number|date|dropdown)$")
    options: list[str] | None = None
    is_required: bool = False
    sort_order: int = 0


class CustomFieldUpdateRequest(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=100)
    field_type: str | None = Field(None, pattern=r"^(text|number|date|dropdown)$")
    options: list[str] | None = None
    is_required: bool | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class CustomFieldResponse(BaseModel):
    id: UUID
    label: str
    field_key: str
    field_type: str
    options: list[str] | None = None
    is_required: bool
    sort_order: int
    is_active: bool
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class CustomFieldListResponse(BaseModel):
    fields: list[CustomFieldResponse]
