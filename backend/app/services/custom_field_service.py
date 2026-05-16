"""Service for managing gym custom field definitions."""
import re
import uuid
import logging

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.custom_field import GymCustomField
from app.schemas.custom_field import CustomFieldCreateRequest, CustomFieldUpdateRequest

logger = logging.getLogger("gymflow.custom_fields")


def _make_field_key(label: str) -> str:
    """Convert a label like 'Blood Group' → 'blood_group'."""
    key = label.strip().lower()
    key = re.sub(r"[^a-z0-9]+", "_", key)
    key = key.strip("_")
    return key or "field"


class CustomFieldService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_fields(self, gym_id: uuid.UUID, active_only: bool = True) -> list[GymCustomField]:
        """List all custom fields for a gym, ordered by sort_order."""
        stmt = (
            select(GymCustomField)
            .where(GymCustomField.gym_id == gym_id)
        )
        if active_only:
            stmt = stmt.where(GymCustomField.is_active == True)  # noqa: E712
        stmt = stmt.order_by(GymCustomField.sort_order, GymCustomField.created_at)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_field(self, gym_id: uuid.UUID, data: CustomFieldCreateRequest) -> GymCustomField:
        """Create a new custom field for the gym."""
        field_key = _make_field_key(data.label)

        # Ensure unique key within gym (append number if duplicate)
        existing_keys = set()
        existing = await self.list_fields(gym_id, active_only=False)
        for f in existing:
            existing_keys.add(f.field_key)

        original_key = field_key
        counter = 1
        while field_key in existing_keys:
            field_key = f"{original_key}_{counter}"
            counter += 1

        field = GymCustomField(
            gym_id=gym_id,
            label=data.label.strip(),
            field_key=field_key,
            field_type=data.field_type,
            options=data.options if data.field_type == "dropdown" else None,
            is_required=data.is_required,
            sort_order=data.sort_order,
        )
        self.db.add(field)
        await self.db.commit()
        await self.db.refresh(field)
        logger.info("Custom field created: %s (key=%s) for gym %s", data.label, field_key, gym_id)
        return field

    async def update_field(
        self, gym_id: uuid.UUID, field_id: uuid.UUID, data: CustomFieldUpdateRequest
    ) -> GymCustomField | None:
        """Update a custom field definition."""
        stmt = select(GymCustomField).where(
            GymCustomField.id == field_id,
            GymCustomField.gym_id == gym_id,
        )
        result = await self.db.execute(stmt)
        field = result.scalar_one_or_none()
        if not field:
            return None

        if data.label is not None:
            field.label = data.label.strip()
        if data.field_type is not None:
            field.field_type = data.field_type
        if data.options is not None:
            field.options = data.options if field.field_type == "dropdown" else None
        if data.is_required is not None:
            field.is_required = data.is_required
        if data.sort_order is not None:
            field.sort_order = data.sort_order
        if data.is_active is not None:
            field.is_active = data.is_active

        await self.db.commit()
        await self.db.refresh(field)
        return field

    async def delete_field(self, gym_id: uuid.UUID, field_id: uuid.UUID) -> bool:
        """Soft-delete a custom field (set is_active=False)."""
        stmt = select(GymCustomField).where(
            GymCustomField.id == field_id,
            GymCustomField.gym_id == gym_id,
        )
        result = await self.db.execute(stmt)
        field = result.scalar_one_or_none()
        if not field:
            return False

        field.is_active = False
        await self.db.commit()
        return True
