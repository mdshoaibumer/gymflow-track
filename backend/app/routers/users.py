"""
User/staff management routes — create, list, update, deactivate gym staff.

RBAC: Owner-only for all mutation endpoints. Admin can list.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_owner, require_admin
from app.core.billing_dependencies import require_active_subscription, require_staff_capacity
from app.schemas.user import CreateUserRequest, UpdateUserRequest, UserResponse
from app.services.user_service import UserService

router = APIRouter()


@router.get("/", response_model=list[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all users in the gym. Accessible by OWNER and ADMIN."""
    service = UserService(db)
    return await service.list_users(current_user.gym_id, skip=skip, limit=limit)


@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(
    data: CreateUserRequest,
    current_user: CurrentUser = Depends(require_owner),
    _sub: CurrentUser = Depends(require_active_subscription),
    _cap: CurrentUser = Depends(require_staff_capacity),
    db: AsyncSession = Depends(get_db),
):
    """Create a new staff/admin user. Owner only. Requires active subscription and staff capacity."""
    service = UserService(db)
    return await service.create_user(current_user.gym_id, data)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    data: UpdateUserRequest,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update a user's details. Owner only. Cannot modify the owner account."""
    service = UserService(db)
    return await service.update_user(user_id, current_user.gym_id, data)


@router.post("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: UUID,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a user. Owner only. Cannot deactivate the owner."""
    service = UserService(db)
    return await service.deactivate_user(user_id, current_user.gym_id)
