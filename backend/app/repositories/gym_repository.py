from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gym import Gym


class GymRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, gym: Gym) -> Gym:
        self.db.add(gym)
        await self.db.flush()
        return gym

    async def get_by_id(self, gym_id: UUID) -> Gym | None:
        result = await self.db.execute(select(Gym).where(Gym.id == gym_id))
        return result.scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> Gym | None:
        result = await self.db.execute(select(Gym).where(Gym.slug == slug))
        return result.scalar_one_or_none()
