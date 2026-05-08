from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user
from app.schemas.member import (
    MemberCreateRequest,
    MemberListResponse,
    MemberResponse,
    MemberUpdateRequest,
)
from app.services.member_service import MemberService

router = APIRouter()


@router.get("", response_model=MemberListResponse)
async def list_members(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List members for the current gym."""
    service = MemberService(db)
    return await service.list_members(current_user.gym_id, skip, limit)


@router.post("", response_model=MemberResponse, status_code=201)
async def create_member(
    data: MemberCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a new member to the gym."""
    service = MemberService(db)
    return await service.create_member(current_user.gym_id, data)


@router.get("/{member_id}", response_model=MemberResponse)
async def get_member(
    member_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific member by ID."""
    service = MemberService(db)
    return await service.get_member(member_id, current_user.gym_id)


@router.patch("/{member_id}", response_model=MemberResponse)
async def update_member(
    member_id: UUID,
    data: MemberUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a member's details."""
    service = MemberService(db)
    return await service.update_member(member_id, current_user.gym_id, data)
