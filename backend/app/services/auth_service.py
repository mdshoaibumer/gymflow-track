import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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
from app.models.auth_token import PasswordResetToken, RefreshToken
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

logger = logging.getLogger("gymflow.auth")


def _hash_token(token: str) -> str:
    """SHA-256 hash a token for storage. Tokens are never stored in plaintext."""
    return hashlib.sha256(token.encode()).hexdigest()


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
        - gym_id cross-check prevents cross-tenant session hijacking
        """
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise AuthenticationError("User not found")
        if not user.is_active:
            raise AccountDisabledError("Account is disabled")
        if user.gym_id != gym_id:
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

        # Generate tokens and track refresh token
        access_token = create_access_token(user.id, gym.id, user.role.value)
        raw_refresh = create_refresh_token(user.id, gym.id, user.role.value)
        await self._store_refresh_token(user.id, raw_refresh)

        return TokenResponse(
            access_token=access_token,
            refresh_token=raw_refresh,
        )

    async def login(self, data: LoginRequest) -> TokenResponse:
        user = await self.user_repo.get_by_email(data.email)
        if not user or not verify_password(data.password, user.password_hash):
            raise AuthenticationError("Invalid email or password")

        if not user.is_active:
            raise AccountDisabledError("Account is disabled")

        access_token = create_access_token(user.id, user.gym_id, user.role.value)
        raw_refresh = create_refresh_token(user.id, user.gym_id, user.role.value)
        await self._store_refresh_token(user.id, raw_refresh)

        return TokenResponse(
            access_token=access_token,
            refresh_token=raw_refresh,
        )

    async def refresh_token(self, data: RefreshRequest) -> TokenResponse:
        payload = decode_token(data.refresh_token)
        if payload is None or payload.get("type") != "refresh":
            raise AuthenticationError("Invalid refresh token")

        user_id = UUID(payload["sub"])
        gym_id = UUID(payload["gym_id"])

        # Validate refresh token is tracked and not revoked
        token_hash = _hash_token(data.refresh_token)
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked == False,  # noqa: E712
            )
        )
        stored_token = result.scalar_one_or_none()
        if not stored_token:
            raise AuthenticationError("Refresh token revoked or invalid")

        if stored_token.expires_at < datetime.now(timezone.utc):
            raise AuthenticationError("Refresh token expired")

        # Validate user still exists and is active
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise AuthenticationError("User no longer exists")
        if not user.is_active:
            raise AccountDisabledError("Account is disabled")
        if user.gym_id != gym_id:
            raise AuthenticationError("Invalid session — gym mismatch")

        # Rotate refresh token: revoke old, issue new
        stored_token.revoked = True
        await self.db.flush()

        new_access = create_access_token(user_id, user.gym_id, user.role.value)
        new_refresh = create_refresh_token(user_id, user.gym_id, user.role.value)
        await self._store_refresh_token(user_id, new_refresh)

        return TokenResponse(
            access_token=new_access,
            refresh_token=new_refresh,
        )

    async def logout(self, user_id: UUID, refresh_token: str | None = None) -> None:
        """
        Revoke refresh tokens for the user.
        If refresh_token is provided, revoke only that token.
        Otherwise, revoke ALL refresh tokens (logout all devices).
        """
        if refresh_token:
            token_hash = _hash_token(refresh_token)
            await self.db.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.token_hash == token_hash,
                    RefreshToken.user_id == user_id,
                )
                .values(revoked=True)
            )
            logger.info(f"Revoked refresh token for user {user_id}")
        else:
            await self.db.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.user_id == user_id,
                    RefreshToken.revoked == False,  # noqa: E712
                )
                .values(revoked=True)
            )
            logger.info(f"Revoked ALL refresh tokens for user {user_id}")

    async def forgot_password(self, email: str) -> str:
        """
        Generate a password reset token.

        Returns a generic success message regardless of whether the email exists
        (prevents email enumeration attacks).

        The raw token is logged in development. In production, integrate
        with the notification system to send via email/SMS.
        """
        user = await self.user_repo.get_by_email(email)

        if not user or not user.is_active:
            logger.info(f"Password reset requested for unknown/inactive email")
            return "If an account exists with that email, a reset link has been sent."

        # Invalidate any existing reset tokens for this user
        await self.db.execute(
            update(PasswordResetToken)
            .where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used == False,  # noqa: E712
            )
            .values(used=True)
        )

        # Generate new reset token
        raw_token = secrets.token_urlsafe(32)
        token_hash = _hash_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

        reset_token = PasswordResetToken(
            id=uuid4(),
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self.db.add(reset_token)
        await self.db.flush()

        # In production, send via email/SMS. For now, log it.
        logger.info(
            f"Password reset token generated for user {user.id}. "
            f"Token (DEV ONLY): {raw_token}"
        )

        return "If an account exists with that email, a reset link has been sent."

    async def reset_password(self, token: str, new_password: str) -> str:
        """
        Reset password using a valid reset token.
        Token is single-use and time-limited (1 hour).
        """
        token_hash = _hash_token(token)

        result = await self.db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used == False,  # noqa: E712
            )
        )
        reset_token = result.scalar_one_or_none()

        if not reset_token:
            raise AuthenticationError("Invalid or expired reset token")

        if reset_token.expires_at < datetime.now(timezone.utc):
            reset_token.used = True
            await self.db.flush()
            raise AuthenticationError("Reset token has expired. Please request a new one.")

        # Mark token as used
        reset_token.used = True

        # Update user's password
        user = await self.user_repo.get_by_id(reset_token.user_id)
        if not user:
            raise AuthenticationError("User not found")

        user.password_hash = hash_password(new_password)
        await self.db.flush()

        # Revoke all refresh tokens (force re-login on all devices)
        await self.logout(user.id)

        logger.info(f"Password reset completed for user {user.id}")
        return "Password has been reset. Please log in with your new password."

    async def _store_refresh_token(self, user_id: UUID, raw_token: str) -> None:
        """Store a hashed refresh token for revocation tracking."""
        payload = decode_token(raw_token)
        expires_at = datetime.fromtimestamp(payload["exp"], tz=timezone.utc) if payload else (
            datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        )

        token_record = RefreshToken(
            id=uuid4(),
            user_id=user_id,
            token_hash=_hash_token(raw_token),
            expires_at=expires_at,
        )
        self.db.add(token_record)
        await self.db.flush()
