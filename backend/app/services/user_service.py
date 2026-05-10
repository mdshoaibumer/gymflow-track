"""
User/staff management service — CRUD for admin and staff accounts within a gym.

Only OWNER can create/update/deactivate users.
Owner accounts cannot be modified through this service.
"""

import logging
from uuid import UUID, uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, AlreadyExistsError, ValidationError
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.user import CreateUserRequest, UpdateUserRequest

logger = logging.getLogger("gymflow.users")


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)

    async def list_users(self, gym_id: UUID, skip: int = 0, limit: int = 50) -> list[User]:
        result = await self.db.execute(
            select(User)
            .where(User.gym_id == gym_id)
            .order_by(User.name)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_users(self, gym_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(User).where(User.gym_id == gym_id)
        )
        return result.scalar_one()

    async def create_user(self, gym_id: UUID, data: CreateUserRequest) -> User:
        existing = await self.user_repo.get_by_email_and_gym(data.email, gym_id)
        if existing:
            raise AlreadyExistsError("A user with this email already exists in your gym")

        user = User(
            id=uuid4(),
            gym_id=gym_id,
            name=data.name,
            email=data.email,
            phone=data.phone,
            password_hash=hash_password(data.password),
            role=data.role,
            is_active=True,
        )
        user = await self.user_repo.create(user)
        logger.info(f"User created: {user.id} role={user.role.value} gym={gym_id}")
        return user

    async def update_user(
        self, user_id: UUID, gym_id: UUID, data: UpdateUserRequest
    ) -> User:
        user = await self._get_gym_user(user_id, gym_id)

        if user.role == UserRole.OWNER:
            raise ValidationError("Cannot modify the gym owner through this API")

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)

        await self.db.flush()
        logger.info(f"User updated: {user_id} fields={list(update_data.keys())}")
        return user

    async def deactivate_user(self, user_id: UUID, gym_id: UUID) -> User:
        user = await self._get_gym_user(user_id, gym_id)

        if user.role == UserRole.OWNER:
            raise ValidationError("Cannot deactivate the gym owner")

        user.is_active = False
        await self.db.flush()
        logger.info(f"User deactivated: {user_id}")
        return user

    async def _get_gym_user(self, user_id: UUID, gym_id: UUID) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user or user.gym_id != gym_id:
            raise NotFoundError("User not found")
        return user
