"""Member management service — CRUD and lifecycle operations for gym members."""

import logging
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AlreadyExistsError, NotFoundError, ValidationError
from app.models.member import Member
from app.repositories.member_repository import MemberRepository
from app.schemas.member import MemberCreateRequest, MemberListResponse, MemberUpdateRequest

logger = logging.getLogger("gymflow.members")

# Fields that must NOT be set via generic update — they have dedicated lifecycle APIs.
# membership_start/end/plan drive status computation and must go through renewal flow.
_PROTECTED_FIELDS = frozenset({"membership_status", "membership_start", "membership_end", "membership_plan"})


class MemberService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.member_repo = MemberRepository(db)

    # ************************************************************
    # Function Name : Create New Gym Member
    #
    # Purpose       : Registers a new member in the gym after checking
    # for duplicate phone numbers within the same
    # tenant. Phone uniqueness is enforced at the
    # business layer to provide clear error messages.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
    async def create_member(self, gym_id: UUID, data: MemberCreateRequest) -> Member:
        # Check for duplicate phone within same gym
        existing = await self.member_repo.get_by_phone_and_gym(data.phone, gym_id)
        if existing:
            raise AlreadyExistsError("Member with this phone number already exists")

        member = Member(gym_id=gym_id, **data.model_dump())
        try:
            return await self.member_repo.create(member)
        except IntegrityError as e:
            # Partial unique index (gym_id, phone) WHERE is_deleted = false
            # can fire on concurrent duplicate phone creation — translate to domain error.
            constraint = getattr(e.orig, "constraint_name", "") or str(e.orig)
            if "phone" in constraint or "uq_members_gym_phone" in constraint:
                raise AlreadyExistsError("Member with this phone number already exists")
            raise

    # ************************************************************
    # Function Name : Retrieve Single Member by ID
    #
    # Purpose       : Fetches a member record scoped to the given gym.
    # Raises NotFoundError if the member does not exist
    # or belongs to a different tenant, ensuring strict
    # tenant isolation.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
    async def get_member(self, member_id: UUID, gym_id: UUID) -> Member:
        member = await self.member_repo.get_by_id(member_id, gym_id)
        if not member:
            raise NotFoundError("Member not found")
        return member

    # ************************************************************
    # Function Name : List Members with Pagination and Search
    #
    # Purpose       : Returns a paginated list of members for the given
    # gym, with optional full-text search on name or
    # phone. Returns both the member list and total
    # count for frontend pagination.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
    async def list_members(
        self, gym_id: UUID, skip: int = 0, limit: int = 50, search: str | None = None
    ) -> MemberListResponse:
        members = await self.member_repo.list_by_gym(gym_id, skip, limit, search)
        total = await self.member_repo.count_by_gym(gym_id, search)
        return MemberListResponse(members=members, total=total)

    # ************************************************************
    # Function Name : Update Member Profile
    #
    # Purpose       : Updates editable member fields while protecting
    # lifecycle fields (membership_status, dates, plan)
    # that must be changed through the membership
    # management API. Validates phone uniqueness on
    # phone number changes.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
    async def update_member(
        self, member_id: UUID, gym_id: UUID, data: MemberUpdateRequest
    ) -> Member:
        member = await self.get_member(member_id, gym_id)

        update_data = data.model_dump(exclude_unset=True)

        # Block direct manipulation of protected lifecycle fields if they are actually changing
        for field_name in _PROTECTED_FIELDS:
            if field_name in update_data:
                current_val = getattr(member, field_name)
                new_val = update_data[field_name]
                
                # Robust comparison: convert both to string if they are dates/datetimes
                # to avoid type-mismatch false positives.
                if str(current_val) != str(new_val):
                    logger.warning(
                        "Attempted protected field change: field=%s current=%s new=%s member_id=%s",
                        field_name, current_val, new_val, member_id
                    )
                    raise ValidationError(
                        f"{field_name} cannot be changed directly. Use the membership management API."
                    )

        # If phone is being changed, check for duplicates
        if "phone" in update_data and update_data["phone"] != member.phone:
            existing = await self.member_repo.get_by_phone_and_gym(
                update_data["phone"], gym_id
            )
            if existing:
                raise AlreadyExistsError("Another member already has this phone number")

        for field, value in update_data.items():
            setattr(member, field, value)

        try:
            return await self.member_repo.update(member)
        except IntegrityError as e:
            constraint = getattr(e.orig, "constraint_name", "") or str(e.orig)
            if "phone" in constraint or "uq_members_gym_phone" in constraint:
                raise AlreadyExistsError("Another member already has this phone number")
            raise

    # ************************************************************
    # Function Name : Soft-Delete Gym Member
    #
    # Purpose       : Marks a member as deleted (soft-delete) rather
    # than permanently removing the record. Preserves
    # historical data for payment records, attendance
    # logs, and audit trails.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
    async def delete_member(self, member_id: UUID, gym_id: UUID) -> None:
        member = await self.get_member(member_id, gym_id)
        member.is_deleted = True
        await self.member_repo.update(member)
