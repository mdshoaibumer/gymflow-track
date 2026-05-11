"""Member management service — CRUD and lifecycle operations for gym members."""

import logging
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AlreadyExistsError, ConflictError, NotFoundError, ValidationError
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

    async def get_member(self, member_id: UUID, gym_id: UUID) -> Member:
        member = await self.member_repo.get_by_id(member_id, gym_id)
        if not member:
            raise NotFoundError("Member not found")
        return member

    async def list_members(
        self, gym_id: UUID, skip: int = 0, limit: int = 50, search: str | None = None
    ) -> MemberListResponse:
        members = await self.member_repo.list_by_gym(gym_id, skip, limit, search)
        total = await self.member_repo.count_by_gym(gym_id, search)
        return MemberListResponse(members=members, total=total)

    async def update_member(
        self, member_id: UUID, gym_id: UUID, data: MemberUpdateRequest
    ) -> Member:
        member = await self.get_member(member_id, gym_id)

        update_data = data.model_dump(exclude_unset=True)

        # Optimistic locking: reject stale updates to prevent silent data loss.
        # The client includes the `version` it read; if the DB version differs,
        # another concurrent edit landed first → return 409 Conflict.
        client_version = update_data.pop("version", None)
        if client_version is not None and client_version != member.version:
            raise ConflictError(
                "This member was modified by another user. "
                "Please refresh and try again."
            )

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

        # Bump version so the next concurrent edit will detect the conflict
        member.version = (member.version or 0) + 1

        try:
            return await self.member_repo.update(member)
        except IntegrityError as e:
            constraint = getattr(e.orig, "constraint_name", "") or str(e.orig)
            if "phone" in constraint or "uq_members_gym_phone" in constraint:
                raise AlreadyExistsError("Another member already has this phone number")
            raise

    async def delete_member(self, member_id: UUID, gym_id: UUID) -> None:
        member = await self.get_member(member_id, gym_id)
        member.is_deleted = True
        await self.member_repo.update(member)
