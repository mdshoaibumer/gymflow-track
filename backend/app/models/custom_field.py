"""Custom field definitions for gym member forms.

Each gym can define unlimited custom fields that appear on the member
registration/edit form. Field values are stored as JSONB on the member record.
"""
import uuid
from enum import Enum as PyEnum

from sqlalchemy import String, ForeignKey, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class FieldType(str, PyEnum):
    TEXT = "text"
    NUMBER = "number"
    DATE = "date"
    DROPDOWN = "dropdown"


class GymCustomField(BaseModel):
    __tablename__ = "gym_custom_fields"

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    field_type: Mapped[str] = mapped_column(String(20), nullable=False, default=FieldType.TEXT)
    # JSON array of options for dropdown fields, e.g. ["A+", "B+", "O+"]
    options: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
