from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, user: User) -> User:
        self.db.add(user)
        await self.db.flush()
        return user

    async def get_by_email(self, email: str) -> User | None:
        """Get user by email. If multiple users share this email across gyms,
        returns the first match — caller must verify password."""
        result = await self.db.execute(
            select(User).where(User.email == email).limit(1)
        )
        return result.scalar_one_or_none()

    async def get_all_by_email(self, email: str) -> list[User]:
        """Get all users with this email across all gyms (for multi-tenant login)."""
        result = await self.db.execute(select(User).where(User.email == email))
        return list(result.scalars().all())

    async def get_by_id(self, user_id: UUID) -> User | None:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email_and_gym(self, email: str, gym_id: UUID) -> User | None:
        result = await self.db.execute(
            select(User).where(User.email == email, User.gym_id == gym_id)
        )
        return result.scalar_one_or_none()
