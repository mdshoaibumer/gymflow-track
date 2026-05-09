"""Gym profile management service — settings and metadata operations."""

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.gym import Gym
from app.repositories.gym_repository import GymRepository
from app.schemas.gym import GymUpdateRequest

logger = logging.getLogger("gymflow.gyms")


class GymService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.gym_repo = GymRepository(db)

    # ************************************************************
    # Function Name : Retrieve Gym Details
    #
    # Purpose       : Fetches the gym record by ID. Used by settings
    # pages and profile displays. Raises NotFoundError
    # if the gym does not exist.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
    async def get_gym(self, gym_id: UUID) -> Gym:
        gym = await self.gym_repo.get_by_id(gym_id)
        if not gym:
            raise NotFoundError("Gym not found")
        return gym

    # ************************************************************
    # Function Name : Update Gym Settings
    #
    # Purpose       : Applies partial updates to the gym profile
    # (name, address, contact details, etc). Only
    # fields included in the request are modified,
    # preserving all other values.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
    async def update_gym(self, gym_id: UUID, data: GymUpdateRequest) -> Gym:
        gym = await self.get_gym(gym_id)

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(gym, field, value)

        await self.db.flush()
        return gym
