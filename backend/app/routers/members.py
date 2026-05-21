from uuid import UUID
import logging

from fastapi import APIRouter, Depends, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_admin
from app.core.billing_dependencies import require_active_subscription, require_member_capacity
from app.schemas.member import (
    MemberCreateRequest,
    MemberListResponse,
    MemberResponse,
    MemberUpdateRequest,
    MembershipOverrideRequest,
)
from app.schemas.payment import PaymentListResponse
from app.services.member_service import MemberService
from app.services.payment_service import PaymentService

logger = logging.getLogger("gymflow.audit")

router = APIRouter()


@router.get("", response_model=MemberListResponse)
async def list_members(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: str | None = Query(None, min_length=1, max_length=100),
    status: str | None = Query(None, description="Filter by membership_status"),
    plan: str | None = Query(None, description="Filter by membership_plan"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List members for the current gym with optional filters.

    Supports:
    - search: name or phone (case-insensitive partial match)
    - status: active, expired, frozen, pending, cancelled
    - plan: exact match on membership_plan name
    All authenticated roles can view members.
    """
    service = MemberService(db)
    return await service.list_members(current_user.gym_id, skip, limit, search, status, plan)


@router.post("", response_model=MemberResponse, status_code=201)
async def create_member(
    data: MemberCreateRequest,
    current_user: CurrentUser = Depends(require_admin),
    _sub: CurrentUser = Depends(require_active_subscription),
    _cap: CurrentUser = Depends(require_member_capacity),
    db: AsyncSession = Depends(get_db),
):
    """Add a new member to the gym. OWNER and ADMIN only. Requires active subscription and capacity."""
    service = MemberService(db)
    return await service.create_member(current_user.gym_id, data)


@router.get("/{member_id}", response_model=MemberResponse)
async def get_member(
    member_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific member by ID. All authenticated roles can view."""
    service = MemberService(db)
    return await service.get_member(member_id, current_user.gym_id)


@router.put("/{member_id}", response_model=MemberResponse)
async def replace_member(
    member_id: UUID,
    data: MemberCreateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Full replacement update of a member. OWNER and ADMIN only.

    Unlike PATCH, PUT requires all fields and replaces the entire resource.
    Used by edit forms that send the complete member object.
    """
    service = MemberService(db)
    # Convert create schema to update schema, excluding protected membership
    # fields that should only be changed via the membership management API.
    # Without this exclusion, PUT sends defaults (None/0) for membership fields
    # which triggers a false "protected field changed" rejection.
    create_data = data.model_dump(exclude={"membership_plan", "membership_start", "membership_end"})
    update_data = MemberUpdateRequest(**create_data)
    return await service.update_member(member_id, current_user.gym_id, update_data)


@router.patch("/{member_id}", response_model=MemberResponse)
async def update_member(
    member_id: UUID,
    data: MemberUpdateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Partial update of a member's details. OWNER and ADMIN only."""
    service = MemberService(db)
    return await service.update_member(member_id, current_user.gym_id, data)


@router.delete("/{member_id}", status_code=204)
async def delete_member(
    member_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a member. OWNER and ADMIN only.

    STAFF cannot delete members — this is a destructive action
    restricted to management roles.
    """
    service = MemberService(db)
    await service.delete_member(member_id, current_user.gym_id)
    logger.info(
        "member_deleted gym_id=%s member_id=%s by_user=%s",
        current_user.gym_id, member_id, current_user.user_id,
    )


@router.patch("/{member_id}/override", response_model=MemberResponse)
async def override_membership(
    member_id: UUID,
    data: MembershipOverrideRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Override protected membership fields. OWNER and ADMIN only.

    Allows direct manipulation of membership_plan, membership_start,
    membership_end, and membership_status. Creates an audit trail.
    """
    service = MemberService(db)
    result = await service.override_membership(
        member_id=member_id,
        gym_id=current_user.gym_id,
        user_id=current_user.user_id,
        data=data,
    )
    logger.info(
        "membership_override gym_id=%s member_id=%s by_user=%s",
        current_user.gym_id, member_id, current_user.user_id,
    )
    return result


@router.get("/{member_id}/payments", response_model=PaymentListResponse)
async def list_member_payments(
    member_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get payment history for a specific member.
    All authenticated roles can view.
    """
    service = PaymentService(db)
    return await service.list_member_payments(
        gym_id=current_user.gym_id,
        member_id=member_id,
        skip=skip,
        limit=limit,
    )


@router.post("/{member_id}/photo", response_model=MemberResponse)
async def upload_member_photo(
    member_id: UUID,
    file: UploadFile = File(..., description="Member photo (JPEG, PNG, or WebP, max 5MB)"),
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload or replace a member's photo. OWNER and ADMIN only.

    Accepts JPEG, PNG, or WebP images up to 5MB.
    The photo is stored on the server and the URL is returned in the member response.
    Re-uploading replaces the previous photo.
    """
    service = MemberService(db)
    return await service.upload_photo(member_id, current_user.gym_id, file)


@router.delete("/{member_id}/photo", response_model=MemberResponse)
async def delete_member_photo(
    member_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member's photo. OWNER and ADMIN only."""
    service = MemberService(db)
    return await service.delete_photo(member_id, current_user.gym_id)
