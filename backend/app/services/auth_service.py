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


# ************************************************************
# Function Name : Hash Authentication Token
#
# Purpose       : Produces a SHA-256 digest of a raw token string
# so that tokens are never stored in plaintext in
# the database. Used for refresh tokens and
# password-reset tokens.
#
# Author        : Mohammed Shoaib U
#
# ************************************************************
def _hash_token(token: str) -> str:
    """SHA-256 hash a token for storage. Tokens are never stored in plaintext."""
    return hashlib.sha256(token.encode()).hexdigest()


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.gym_repo = GymRepository(db)
        self.user_repo = UserRepository(db)

    # ************************************************************
    # Function Name : Retrieve Authenticated User Profile
    #
    # Purpose       : Fetches the full user profile from the database
    # for the currently authenticated user. Validates
    # that the user still exists, is active, and
    # belongs to the expected gym (prevents cross-
    # tenant session hijacking).
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
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

    # ************************************************************
    # Function Name : Register New Gym and Owner Account
    #
    # Purpose       : Creates a new gym entity with a unique slug,
    # registers the first user as the OWNER, provisions
    # a trial subscription, and returns JWT tokens for
    # immediate authentication. This is the primary
    # onboarding entry point for new customers.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
    async def register_gym(self, data: GymRegisterRequest) -> TokenResponse:
        # Note: email uniqueness is per-gym (UniqueConstraint gym_id+email).
        # We don't block registration globally — the DB constraint handles
        # same-email-same-gym collisions via IntegrityError below.

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

        try:
            # Create trial subscription for the new gym
            await create_trial_subscription(self.db, gym.id)

            # Generate tokens and track refresh token
            access_token = create_access_token(user.id, gym.id, user.role.value)
            raw_refresh = create_refresh_token(user.id, gym.id, user.role.value)
            await self._store_refresh_token(user.id, raw_refresh)

            # Flush to trigger unique constraints before returning
            await self.db.flush()

            return TokenResponse(
                access_token=access_token,
                refresh_token=raw_refresh,
            )
        except Exception as e:
            err_str = str(e).lower()
            if "uq_users_gym_email" in err_str or "unique" in err_str:
                raise AlreadyExistsError("Email already registered")
            raise

    # ************************************************************
    # Function Name : Authenticate User Login
    #
    # Purpose       : Validates user credentials (email + password),
    # checks that the account is active, then issues
    # a fresh pair of access and refresh JWT tokens.
    # Failed attempts raise AuthenticationError for
    # generic error messaging (prevents user enumeration).
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
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

    # ************************************************************
    # Function Name : Refresh Authentication Token
    #
    # Purpose       : Validates the provided refresh token, rotates it
    # (revokes old, issues new), and returns a fresh
    # token pair. Implements reuse detection — if a
    # revoked token is reused, ALL user sessions are
    # revoked as a security safeguard against token theft.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
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
            )
        )
        stored_token = result.scalar_one_or_none()

        if not stored_token:
            raise AuthenticationError("Refresh token revoked or invalid")

        # Reuse detection: if a revoked token is re-presented, an attacker
        # may have stolen it. Revoke ALL tokens for this user as a safeguard.
        if stored_token.revoked:
            await self.db.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.user_id == user_id,
                    RefreshToken.revoked == False,  # noqa: E712
                )
                .values(revoked=True)
            )
            await self.db.flush()
            logger.warning(
                f"Refresh token reuse detected for user {user_id} — "
                f"all sessions revoked (potential token theft)"
            )
            raise AuthenticationError("Refresh token reuse detected — all sessions revoked")

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

    # ************************************************************
    # Function Name : Logout and Revoke Refresh Tokens
    #
    # Purpose       : Revokes either a specific refresh token (single
    # device logout) or all tokens for the user (logout
    # from all devices). Used on explicit logout and
    # after password reset for security.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
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

    # ************************************************************
    # Function Name : Initiate Password Reset Flow
    #
    # Purpose       : Generates a one-time password reset token valid
    # for 1 hour. Returns a generic success message
    # regardless of whether the email exists to prevent
    # email enumeration attacks. Invalidates any
    # previously issued reset tokens for the user.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
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

        # Only log raw token in development — NEVER in production/staging
        if settings.is_development:
            logger.info(
                f"Password reset token generated for user {user.id}. "
                f"Token (DEV ONLY): {raw_token}"
            )
        else:
            logger.info(f"Password reset token generated for user {user.id}")

        return "If an account exists with that email, a reset link has been sent."

    # ************************************************************
    # Function Name : Complete Password Reset
    #
    # Purpose       : Validates the reset token, updates the user's
    # password hash, marks the token as used, and
    # revokes all refresh tokens to force re-login on
    # all devices. Single-use and time-limited (1 hour).
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
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

    @staticmethod
    def _generate_slug(gym_name: str) -> str:
        """
        Generate a URL-friendly slug from a gym name.

        Converts "Muscle Factory Gym" → "muscle-factory-gym".
        Used for public-facing gym URLs and unique identification.
        Handles Unicode, multiple spaces, and special characters.
        """
        slug = gym_name.lower().strip()
        # Replace non-alphanumeric (except hyphens) with hyphens
        slug = re.sub(r"[^a-z0-9]+", "-", slug)
        # Remove leading/trailing hyphens
        slug = slug.strip("-")
        # Collapse consecutive hyphens
        slug = re.sub(r"-{2,}", "-", slug)
        return slug or "gym"
