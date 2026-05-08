from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.repositories.member_repository import MemberRepository
from app.schemas.member import MemberCreateRequest, MemberListResponse, MemberUpdateRequest


class MemberService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.member_repo = MemberRepository(db)

    async def create_member(self, gym_id: UUID, data: MemberCreateRequest) -> Member:
        # Check for duplicate phone within same gym
        existing = await self.member_repo.get_by_phone_and_gym(data.phone, gym_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Member with this phone number already exists",
            )

        member = Member(gym_id=gym_id, **data.model_dump())
        return await self.member_repo.create(member)

    async def get_member(self, member_id: UUID, gym_id: UUID) -> Member:
        member = await self.member_repo.get_by_id(member_id, gym_id)
        if not member:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found",
            )
        return member

    async def list_members(
        self, gym_id: UUID, skip: int = 0, limit: int = 50
    ) -> MemberListResponse:
        members = await self.member_repo.list_by_gym(gym_id, skip, limit)
        total = await self.member_repo.count_by_gym(gym_id)
        return MemberListResponse(members=members, total=total)

    async def update_member(
        self, member_id: UUID, gym_id: UUID, data: MemberUpdateRequest
    ) -> Member:
        member = await self.get_member(member_id, gym_id)

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(member, field, value)

        return await self.member_repo.update(member)
