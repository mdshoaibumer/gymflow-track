"""API endpoints for managing gym custom fields (owner/admin only)."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, require_owner
from app.schemas.custom_field import (
    CustomFieldCreateRequest,
    CustomFieldListResponse,
    CustomFieldResponse,
    CustomFieldUpdateRequest,
)
from app.services.custom_field_service import CustomFieldService

router = APIRouter()


@router.get("", response_model=CustomFieldListResponse)
async def list_custom_fields(
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """List all active custom fields for the current gym."""
    service = CustomFieldService(db)
    fields = await service.list_fields(current_user.gym_id)
    return {"fields": fields}


@router.post("", response_model=CustomFieldResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_field(
    data: CustomFieldCreateRequest,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Create a new custom field for the gym. Owner only."""
    service = CustomFieldService(db)
    field = await service.create_field(current_user.gym_id, data)
    return field


@router.patch("/{field_id}", response_model=CustomFieldResponse)
async def update_custom_field(
    field_id: UUID,
    data: CustomFieldUpdateRequest,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update a custom field. Owner only."""
    service = CustomFieldService(db)
    field = await service.update_field(current_user.gym_id, field_id, data)
    if not field:
        raise HTTPException(status_code=404, detail="Custom field not found")
    return field


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_field(
    field_id: UUID,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a custom field. Owner only."""
    service = CustomFieldService(db)
    deleted = await service.delete_field(current_user.gym_id, field_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Custom field not found")
