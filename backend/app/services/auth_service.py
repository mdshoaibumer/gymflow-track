import re
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    AccountDisabledError,
    AlreadyExistsError,
    AuthenticationError,
)
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
    CurrentUserResponse,
    GymRegisterRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
)
from app.services.billing_service import create_trial_subscription


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.gym_repo = GymRepository(db)
        self.user_repo = UserRepository(db)

    async def get_current_user_profile(self, user_id: UUID, gym_id: UUID) -> CurrentUserResponse:
        """
        Fetch the authenticated user's profile from DB.

        Why we don't just return JWT claims:
        - Validates user still exists (could have been deleted since token issued)
        - Validates user is still active (could have been disabled)
        - Returns fresh data (name/email could have changed)
        - gym_id cross-check prevents use of stolen tokens after user reassignment
        """
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise AuthenticationError("User not found")
        if not user.is_active:
            raise AccountDisabledError("Account is disabled")
        if user.gym_id != gym_id:
            # Token's gym_id doesn't match user's current gym — stale token
            raise AuthenticationError("Invalid session")

        return CurrentUserResponse.model_validate(user)

    async def register_gym(self, data: GymRegisterRequest) -> TokenResponse:
        # Check if email already exists
        existing_user = await self.user_repo.get_by_email(data.email)
        if existing_user:
            raise AlreadyExistsError("Email already registered")

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

        # Create trial subscription for the new gym
        await create_trial_subscription(self.db, gym.id)

        # Generate tokens
        return TokenResponse(
            access_token=create_access_token(user.id, gym.id, user.role.value),
            refresh_token=create_refresh_token(user.id, gym.id, user.role.value),
        )

    async def login(self, data: LoginRequest) -> TokenResponse:
        # get_by_email does a global lookup — this is intentional because:
        # 1. Registration enforces global email uniqueness
        # 2. User doesn't know their gym_id at login time
        # 3. The DB constraint is per-gym, but the service prevents cross-gym duplicates
        user = await self.user_repo.get_by_email(data.email)
        if not user or not verify_password(data.password, user.password_hash):
            raise AuthenticationError("Invalid email or password")

        if not user.is_active:
            raise AccountDisabledError("Account is disabled")

        return TokenResponse(
            access_token=create_access_token(user.id, user.gym_id, user.role.value),
            refresh_token=create_refresh_token(user.id, user.gym_id, user.role.value),
        )

    async def refresh_token(self, data: RefreshRequest) -> TokenResponse:
        payload = decode_token(data.refresh_token)
        if payload is None or payload.get("type") != "refresh":
            raise AuthenticationError("Invalid refresh token")

        user_id = UUID(payload["sub"])
        gym_id = UUID(payload["gym_id"])

        # Validate user still exists and is active — prevents stolen refresh
        # tokens from generating access tokens for deleted/disabled accounts
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise AuthenticationError("User no longer exists")
        if not user.is_active:
            raise AccountDisabledError("Account is disabled")
        # Validate gym_id hasn't changed (prevents stale tokens after user reassignment)
        if user.gym_id != gym_id:
            raise AuthenticationError("Invalid session — gym mismatch")

        # Use user's current role (not the stale role from the token)
        return TokenResponse(
            access_token=create_access_token(user_id, user.gym_id, user.role.value),
            refresh_token=create_refresh_token(user_id, user.gym_id, user.role.value),
        )

    @staticmethod
    def _generate_slug(name: str) -> str:
        slug = name.lower().strip()
        slug = re.sub(r"[^a-z0-9\s-]", "", slug)
        slug = re.sub(r"[\s-]+", "-", slug)
        return slug[:80]
