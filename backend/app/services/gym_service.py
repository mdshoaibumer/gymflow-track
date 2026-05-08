from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gym import Gym
from app.repositories.gym_repository import GymRepository
from app.schemas.gym import GymUpdateRequest


class GymService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.gym_repo = GymRepository(db)

    async def get_gym(self, gym_id: UUID) -> Gym:
        gym = await self.gym_repo.get_by_id(gym_id)
        if not gym:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Gym not found",
            )
        return gym

    async def update_gym(self, gym_id: UUID, data: GymUpdateRequest) -> Gym:
        gym = await self.get_gym(gym_id)

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(gym, field, value)

        await self.db.flush()
        return gym
