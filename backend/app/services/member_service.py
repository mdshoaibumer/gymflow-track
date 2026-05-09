from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AlreadyExistsError, NotFoundError, ValidationError
from app.models.member import Member
from app.repositories.member_repository import MemberRepository
from app.schemas.member import MemberCreateRequest, MemberListResponse, MemberUpdateRequest

# Fields that must NOT be set via generic update — they have dedicated lifecycle APIs
_PROTECTED_FIELDS = frozenset({"membership_status"})


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
        return await self.member_repo.create(member)

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

        # Block direct manipulation of protected lifecycle fields
        for field_name in _PROTECTED_FIELDS:
            if field_name in update_data:
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

        return await self.member_repo.update(member)

    async def delete_member(self, member_id: UUID, gym_id: UUID) -> None:
        member = await self.get_member(member_id, gym_id)
        member.is_deleted = True
        await self.member_repo.update(member)
