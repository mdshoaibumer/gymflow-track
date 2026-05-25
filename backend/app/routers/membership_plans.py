"""API endpoints for managing gym membership plans (owner/admin only)."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_admin
from app.schemas.membership_plan import (
    MembershipPlanCreateRequest,
    MembershipPlanListResponse,
    MembershipPlanResponse,
    MembershipPlanUpdateRequest,
)
from app.services.membership_plan_service import MembershipPlanService

router = APIRouter()


@router.get("", response_model=MembershipPlanListResponse)
async def list_membership_plans(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active membership plans for the current gym."""
    service = MembershipPlanService(db)
    plans = await service.list_plans(current_user.gym_id)
    return {"plans": plans}


@router.post("", response_model=MembershipPlanResponse, status_code=status.HTTP_201_CREATED)
async def create_membership_plan(
    data: MembershipPlanCreateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new membership plan. Owner/Admin only."""
    service = MembershipPlanService(db)
    plan = await service.create_plan(current_user.gym_id, data)
    return plan


@router.patch("/{plan_id}", response_model=MembershipPlanResponse)
async def update_membership_plan(
    plan_id: UUID,
    data: MembershipPlanUpdateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a membership plan. Owner/Admin only."""
    service = MembershipPlanService(db)
    plan = await service.update_plan(current_user.gym_id, plan_id, data)
    if not plan:
        raise HTTPException(status_code=404, detail="Membership plan not found")
    return plan


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_membership_plan(
    plan_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete (deactivate) a membership plan. Owner/Admin only."""
    service = MembershipPlanService(db)
    deleted = await service.delete_plan(current_user.gym_id, plan_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Membership plan not found")
