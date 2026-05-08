from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_owner
from app.schemas.gym import GymResponse, GymUpdateRequest
from app.services.gym_service import GymService

router = APIRouter()


@router.get("/me", response_model=GymResponse)
async def get_my_gym(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's gym details. All roles can view."""
    service = GymService(db)
    return await service.get_gym(current_user.gym_id)


@router.patch("/me", response_model=GymResponse)
async def update_my_gym(
    data: GymUpdateRequest,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's gym details. OWNER only."""
    service = GymService(db)
    return await service.update_gym(current_user.gym_id, data)
