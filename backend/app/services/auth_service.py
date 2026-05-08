import re

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.gym import Gym
from app.models.user import User, UserRole
from app.repositories.gym_repository import GymRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    GymRegisterRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
)


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.gym_repo = GymRepository(db)
        self.user_repo = UserRepository(db)

    async def register_gym(self, data: GymRegisterRequest) -> TokenResponse:
        # Check if email already exists
        existing_user = await self.user_repo.get_by_email(data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

        # Generate slug from gym name
        slug = self._generate_slug(data.gym_name)
        existing_gym = await self.gym_repo.get_by_slug(slug)
        if existing_gym:
            slug = f"{slug}-{data.phone[-4:]}"

        # Create gym
        gym = Gym(
            name=data.gym_name,
            slug=slug,
            phone=data.phone,
            email=data.email,
            city=data.city,
        )
        gym = await self.gym_repo.create(gym)

        # Create owner user
        user = User(
            gym_id=gym.id,
            name=data.owner_name,
            email=data.email,
            phone=data.phone,
            password_hash=hash_password(data.password),
            role=UserRole.OWNER,
        )
        user = await self.user_repo.create(user)

        # Generate tokens
        return TokenResponse(
            access_token=create_access_token(user.id, gym.id),
            refresh_token=create_refresh_token(user.id, gym.id),
        )

    async def login(self, data: LoginRequest) -> TokenResponse:
        user = await self.user_repo.get_by_email(data.email)
        if not user or not verify_password(data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled",
            )

        return TokenResponse(
            access_token=create_access_token(user.id, user.gym_id),
            refresh_token=create_refresh_token(user.id, user.gym_id),
        )

    async def refresh_token(self, data: RefreshRequest) -> TokenResponse:
        payload = decode_token(data.refresh_token)
        if payload is None or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

        from uuid import UUID

        user_id = UUID(payload["sub"])
        gym_id = UUID(payload["gym_id"])

        return TokenResponse(
            access_token=create_access_token(user_id, gym_id),
            refresh_token=create_refresh_token(user_id, gym_id),
        )

    @staticmethod
    def _generate_slug(name: str) -> str:
        slug = name.lower().strip()
        slug = re.sub(r"[^a-z0-9\s-]", "", slug)
        slug = re.sub(r"[\s-]+", "-", slug)
        return slug[:80]
