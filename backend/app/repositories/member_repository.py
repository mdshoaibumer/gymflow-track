from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member


class MemberRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, member: Member) -> Member:
        self.db.add(member)
        await self.db.flush()
        return member

    async def get_by_id(self, member_id: UUID, gym_id: UUID) -> Member | None:
        result = await self.db.execute(
            select(Member).where(Member.id == member_id, Member.gym_id == gym_id)
        )
        return result.scalar_one_or_none()

    async def list_by_gym(
        self, gym_id: UUID, skip: int = 0, limit: int = 50
    ) -> list[Member]:
        result = await self.db.execute(
            select(Member)
            .where(Member.gym_id == gym_id)
            .order_by(Member.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_by_gym(self, gym_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Member).where(Member.gym_id == gym_id)
        )
        return result.scalar_one()

    async def update(self, member: Member) -> Member:
        await self.db.flush()
        return member

    async def get_by_phone_and_gym(self, phone: str, gym_id: UUID) -> Member | None:
        result = await self.db.execute(
            select(Member).where(Member.phone == phone, Member.gym_id == gym_id)
        )
        return result.scalar_one_or_none()
