import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_backend
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

# Maximum depth for following refresh token replacement chains.
# Prevents DoS via adversarial token chains that cause unbounded DB queries.
_MAX_CHAIN_DEPTH = 5

logger = logging.getLogger("gymflow.auth")

# Maximum depth for following refresh token replacement chains.
# Prevents DoS via adversarial token chains that cause unbounded DB queries.
_MAX_CHAIN_DEPTH = 5

# Pre-computed bcrypt hash used for constant-time rejection on invalid emails.
# Prevents timing side-channels from revealing whether an email is registered.
_DUMMY_HASH = "$2b$12$LJ3m4ys3Lf2Hbs5MhFclcOvpS2yJqinSPnNlVqFOK0D3IsVHyqEvC"


def _hash_token(token: str) -> str:
    """SHA-256 hash a token for storage. Tokens are never stored in plaintext."""
    return hashlib.sha256(token.encode()).hexdigest()


def _mask_email(email: str) -> str:
    """Return a truncated SHA-256 hash of an email for safe logging.

    PII (email addresses) must never appear in production logs.
    A 12-char hash prefix is sufficient for log correlation without
    revealing the actual email address.
    """
    return hashlib.sha256(email.lower().encode()).hexdigest()[:12]


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
        if gym_id is not None and user.gym_id != gym_id:
            raise AuthenticationError("Invalid session")

        return CurrentUserResponse.model_validate(user)

    async def register_gym(self, data: GymRegisterRequest) -> TokenResponse:
        # Note: email uniqueness is per-gym (UniqueConstraint gym_id+email).
        # We don't block registration globally — the DB constraint handles
        # same-email-same-gym collisions via IntegrityError below.
        logger.info("Registration attempt for gym '%s' (email_hash=%s)", data.gym_name, _mask_email(data.email))

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

        try:
            user = await self.user_repo.create(user)

            # Create trial subscription for the new gym
            await create_trial_subscription(self.db, gym.id)

            # Generate tokens and track refresh token
            access_token = create_access_token(user.id, gym.id, user.role.value)
            raw_refresh = create_refresh_token(user.id, gym.id, user.role.value)
            await self._store_refresh_token(user.id, raw_refresh)

            # Flush to trigger any remaining constraints before returning
            await self.db.flush()

            return TokenResponse(
                access_token=access_token,
                refresh_token=raw_refresh,
            )
        except IntegrityError as e:
            # Let get_db() handle rollback — just raise the domain error.
            # Inspect constraint name to give an accurate error message.
            constraint = getattr(e.orig, "constraint_name", "") or str(e.orig)
            logger.warning("Registration failed (email_hash=%s): IntegrityError (%s)", _mask_email(data.email), constraint)
            if "slug" in constraint:
                raise AlreadyExistsError("Gym name too similar to existing gym — please choose a different name")
            raise AlreadyExistsError("Email already registered")

    async def login(self, data: LoginRequest) -> TokenResponse:
        # Multi-tenant safe: same email can exist in different gyms
        users = await self.user_repo.get_all_by_email(data.email)

        if not users:
            # No user found — run a dummy bcrypt check to prevent timing
            # side-channel that reveals whether an email is registered.
            verify_password(data.password, _DUMMY_HASH)
            logger.warning("Login failed: email not found (email_hash=%s)", _mask_email(data.email))
            raise AuthenticationError("Invalid email or password")

        user = None
        for candidate in users:
            if verify_password(data.password, candidate.password_hash):
                user = candidate
                break

        if not user:
            logger.warning("Login failed: invalid password (email_hash=%s)", _mask_email(data.email))
            raise AuthenticationError("Invalid email or password")

        if not user.is_active:
            logger.warning(f"Login failed: account disabled (user_id={user.id})")
            raise AccountDisabledError("Account is disabled")

        access_token = create_access_token(user.id, user.gym_id, user.role.value)
        raw_refresh = create_refresh_token(user.id, user.gym_id, user.role.value)
        await self._store_refresh_token(user.id, raw_refresh)

        logger.info(f"Login successful (user_id={user.id}, gym_id={user.gym_id})")
        return TokenResponse(
            access_token=access_token,
            refresh_token=raw_refresh,
        )

    # Grace period (seconds) for concurrent refresh requests (multi-tab scenario).
    # If a revoked token is re-presented within this window, the replacement token
    # is returned instead of triggering reuse-detection revocation.
    REFRESH_GRACE_SECONDS = 30

    async def refresh_token(self, data: RefreshRequest) -> TokenResponse:
        payload = decode_token(data.refresh_token)
        if payload is None or payload.get("type") != "refresh":
            raise AuthenticationError("Invalid refresh token")

        user_id = UUID(payload["sub"])
        gym_id_raw = payload.get("gym_id")
        gym_id = UUID(gym_id_raw) if gym_id_raw else None

        # Validate refresh token is tracked and not revoked
        token_hash = _hash_token(data.refresh_token)
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
            ).with_for_update()
        )
        stored_token = result.scalar_one_or_none()

        if not stored_token:
            logger.warning(f"Refresh token NOT FOUND in DB: {token_hash[:10]}...")
            raise AuthenticationError("Refresh token revoked or invalid")

        # Reuse detection with grace window for multi-tab concurrent refreshes.
        # If the token was revoked within the grace period, return the replacement
        # token pair instead of revoking all sessions.
        if stored_token.revoked:
            logger.warning("Revoked refresh token presented for user %s — checking grace window", user_id)
            # Check if within grace window (concurrent multi-tab refresh)
            if (
                stored_token.revoked_at is not None
                and stored_token.replaced_by_hash is not None
                and (datetime.now(timezone.utc) - stored_token.revoked_at).total_seconds()
                    < self.REFRESH_GRACE_SECONDS
            ):
                # Look up the replacement token to verify it's still valid.
                # If multiple concurrent refreshes occur, they might form a chain
                # of replacements. We follow the chain to find an active one.
                current_replacement_hash = stored_token.replaced_by_hash
                replacement_token = None
                chain_depth = 0
                
                while current_replacement_hash and chain_depth < _MAX_CHAIN_DEPTH:
                    chain_depth += 1
                    replacement = await self.db.execute(
                        select(RefreshToken).where(
                            RefreshToken.token_hash == current_replacement_hash,
                        ).with_for_update()
                    )
                    temp_token = replacement.scalar_one_or_none()
                    if not temp_token:
                        break
                    
                    if not temp_token.revoked:
                        replacement_token = temp_token
                        break
                    
                    # If this replacement is also revoked, check if IT is within its own grace window
                    if (
                        temp_token.revoked_at is not None
                        and (datetime.now(timezone.utc) - temp_token.revoked_at).total_seconds()
                            < self.REFRESH_GRACE_SECONDS
                        and temp_token.replaced_by_hash
                    ):
                        current_replacement_hash = temp_token.replaced_by_hash
                    else:
                        break

                if replacement_token:
                    # Validate user is still active before returning tokens
                    user = await self.user_repo.get_by_id(user_id)
                    if not user or not user.is_active:
                        raise AuthenticationError("Invalid session")
                    if gym_id is not None and user.gym_id != gym_id:
                        raise AuthenticationError("Invalid session")

                    # Re-mint access token (cheap) but keep the same refresh token
                    new_access = create_access_token(user_id, user.gym_id, user.role.value)
                    # Use the FOUND replacement token to mint the response
                    # Since we don't have the plaintext of replacement_token, 
                    # we must re-mint a new JWT and update the replacement's hash.
                    new_refresh = create_refresh_token(user_id, user.gym_id, user.role.value)
                    new_hash = _hash_token(new_refresh)
                    
                    replacement_token.token_hash = new_hash
                    # If we followed a chain, update the ORIGINAL stored_token's 
                    # replaced_by_hash to point to the LATEST one for future efficiency.
                    stored_token.replaced_by_hash = new_hash
                    
                    await self.db.flush()  # Let get_db() handle the final commit

                    logger.info(
                        f"Grace-period refresh for user {user_id} — "
                        f"concurrent tab served via replacement chain"
                    )
                    return TokenResponse(
                        access_token=new_access,
                        refresh_token=new_refresh,
                    )

            # Outside grace window or no replacement — genuine reuse detection
            await self.db.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.user_id == user_id,
                    RefreshToken.revoked.is_(False),
                )
                .values(revoked=True, revoked_at=datetime.now(timezone.utc))
            )
            # NUCLEAR REVOCATION: Invalidate all existing access tokens too
            await self.db.execute(
                update(User)
                .where(User.id == user_id)
                .values(sessions_revoked_at=datetime.now(timezone.utc))
            )
            # Flush to persist the revocation within the current transaction.
            # IMPORTANT: This is a security-critical commit. We MUST persist the
            # revocation before raising the exception, because get_db() will
            # rollback on exception. Unlike the grace-period path (which uses
            # flush and returns normally), this path must commit explicitly
            # to guarantee token revocation survives the exception.
            await self.db.commit()

            # Invalidate cache to ensure immediate enforcement
            cache = get_cache_backend()
            cache.delete(f"user_active:{user_id}")
            cache.delete(f"user_revoked_at:{user_id}")

            logger.warning(
                f"Refresh token reuse detected for user {user_id} — "
                f"all sessions revoked (potential token theft)"
            )
            raise AuthenticationError("Refresh token reuse detected — all sessions revoked")

        token_expiry = stored_token.expires_at
        if token_expiry.tzinfo is None:
            token_expiry = token_expiry.replace(tzinfo=timezone.utc)
        if token_expiry < datetime.now(timezone.utc):
            raise AuthenticationError("Refresh token expired")

        # Validate user still exists and is active
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise AuthenticationError("User no longer exists")
        if not user.is_active:
            raise AccountDisabledError("Account is disabled")
        if gym_id is not None and user.gym_id != gym_id:
            raise AuthenticationError("Invalid session — gym mismatch")

        # Rotate refresh token: revoke old, issue new
        new_access = create_access_token(user_id, user.gym_id, user.role.value)
        new_refresh = create_refresh_token(user_id, user.gym_id, user.role.value)
        new_hash = _hash_token(new_refresh)

        stored_token.revoked = True
        stored_token.revoked_at = datetime.now(timezone.utc)
        stored_token.replaced_by_hash = new_hash
        await self.db.flush()

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
                    RefreshToken.revoked.is_(False),
                )
                .values(revoked=True)
            )
            logger.info(f"Revoked ALL refresh tokens for user {user_id}")
            
            # Invalidate cache
            cache = get_cache_backend()
            cache.delete(f"user_active:{user_id}")
            cache.delete(f"user_revoked_at:{user_id}")

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
            # Run a dummy hash to normalize response time (prevents timing enumeration)
            verify_password("dummy", _DUMMY_HASH)
            logger.info("Password reset requested for unknown/inactive email")
            return "If an account exists with that email, a reset link has been sent."

        # Invalidate any existing reset tokens for this user
        await self.db.execute(
            update(PasswordResetToken)
            .where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used.is_(False),
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

    async def reset_password(self, token: str, new_password: str) -> str:
        """
        Reset password using a valid reset token.
        Token is single-use and time-limited (1 hour).
        """
        token_hash = _hash_token(token)

        result = await self.db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used.is_(False),
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
