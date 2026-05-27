"""Authentication Dependencies — FastAPI Dependency Injection.

Description : Provides `get_current_user` and `require_role` dependencies
              for securing API endpoints. Extracts JWT from cookies/headers,
              validates tokens, and enforces RBAC with user-active checks.
Author      : Mohammed Shoaib U
Module      : app.core.dependencies
"""

from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.cache import get_cache_backend
from app.core.cookies import ACCESS_COOKIE
from app.core.security import decode_token
from app.middleware.request_context import set_tenant_context
from app.models.user import UserRole
import logging

logger = logging.getLogger("gymflow.auth")

# Optional bearer scheme — does not reject requests missing the header,
# allowing cookie-based auth to work as a fallback.
security_scheme = HTTPBearer(auto_error=False)

_USER_CACHE_TTL = 60  # seconds


class CurrentUser:
    """Represents the authenticated user extracted from JWT."""

    def __init__(self, user_id: UUID, gym_id: UUID | None, role: UserRole):
        self.user_id = user_id
        self.gym_id = gym_id
        self.role = role

    @property
    def is_owner(self) -> bool:
        return self.role == UserRole.OWNER

    @property
    def is_admin_or_above(self) -> bool:
        return self.role in (UserRole.OWNER, UserRole.ADMIN)

    @property
    def is_super_admin(self) -> bool:
        return self.role == UserRole.SUPER_ADMIN


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
) -> CurrentUser:
    """Extract and validate the current user from the JWT access token.

    Token resolution order:
    1. Authorization: Bearer <token> header (API clients, mobile apps)
    2. HttpOnly cookie (browser-based clients)

    Additionally checks a lightweight cache to detect disabled/deleted users
    within ~60 seconds of account changes (instead of only on token expiry).
    """
    token = None

    # 1. Try Authorization header first (explicit wins over implicit)
    if credentials and credentials.credentials:
        token = credentials.credentials

    # 2. Fall back to HttpOnly cookie
    if not token:
        token = request.cookies.get(ACCESS_COOKIE)

    if not token:
        logger.warning(f"Auth failed: No token found in Authorization header or {ACCESS_COOKIE} cookie")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = decode_token(token)
    if payload is None:
        logger.warning("Auth failed: Token decoding failed (invalid signature or malformed)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    
    if payload.get("type") != "access":
        logger.warning(f"Auth failed: Wrong token type (expected access, got {payload.get('type')})")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    try:
        role = UserRole(payload["role"])
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
        )

    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
        )

    gym_id_raw = payload.get("gym_id")
    gym_id = UUID(gym_id_raw) if gym_id_raw else None

    # Lightweight active-user check (cached, not every request hits DB)
    iat = payload.get("iat")
    await _check_user_active(user_id, iat)

    user = CurrentUser(
        user_id=user_id,
        gym_id=gym_id,
        role=role,
    )
    _set_log_context(user)
    return user


async def _check_user_active(user_id: UUID, iat: int | None = None) -> None:
    """Check if user is still active using a time-based cache.
    
    Also checks if the session has been globally revoked.
    """
    uid_str = str(user_id)
    cache = get_cache_backend()

    # Check cache for basic active status
    cached = cache.get(f"user_active:{uid_str}")
    cached_revoked_at = cache.get(f"user_revoked_at:{uid_str}")
    
    if cached is not None:
        if cached == "0":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is disabled",
            )
        # If active, check if session is revoked
        if cached_revoked_at and iat:
            revoked_at_ts = float(cached_revoked_at)
            # Reject tokens issued at or before the revocation timestamp.
            if iat <= int(revoked_at_ts):
                logger.warning(f"Session REVOKED (CACHED) for user {user_id} (iat {iat} <= revoked_at {revoked_at_ts})")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session has been revoked",
                )
        if cached == "1" and cached_revoked_at is not None:
             return # Fully cached

    # Cache miss or need fresh revocation data — query DB
    from app.core.database import async_session_factory
    from sqlalchemy import select
    from app.models.user import User

    try:
        async with async_session_factory() as session:
            result = await session.execute(
                select(User.is_active, User.sessions_revoked_at).where(User.id == user_id)
            )
            row = result.fetchone()
            if row is None:
                is_active = False
                revoked_at = None
            else:
                is_active = row.is_active
                revoked_at = row.sessions_revoked_at

            # Update cache
            cache.set(f"user_active:{uid_str}", "1" if is_active else "0", _USER_CACHE_TTL)
            if revoked_at:
                revoked_at_ts = int(revoked_at.timestamp())
                cache.set(f"user_revoked_at:{uid_str}", str(revoked_at_ts), _USER_CACHE_TTL)
            else:
                cache.set(f"user_revoked_at:{uid_str}", "", _USER_CACHE_TTL)

            if not is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Account is disabled",
                )
            
            if revoked_at and iat:
                revoked_ts = revoked_at.timestamp()
                # Reject tokens issued at or before the revocation timestamp.
                if iat <= int(revoked_ts):
                    logger.warning("Session revoked for user %s (iat %s <= revoked_at %s)", user_id, iat, revoked_ts)
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Session has been revoked",
                    )
    except HTTPException:
        raise
    except Exception:
        # DB error — log for visibility. Allow request to proceed since
        # access token was already validated; downstream routes still
        # enforce tenant isolation. Blocking here on transient DB errors
        # would cause cascading 401s for all users.
        logger.warning(
            f"Active-user check failed for user {user_id} — DB unreachable, "
            "allowing request based on valid access token"
        )


def require_role(*allowed_roles: UserRole):
    """
    Factory that creates a dependency enforcing role-based access.

    Usage:
        @router.delete("/{id}", dependencies=[Depends(require_role(UserRole.OWNER, UserRole.ADMIN))])

    Why a factory instead of a single dependency:
    - Each endpoint can declare its own permission set
    - Composable — combine with other dependencies
    - Readable at the route level (intent is clear)

    Security model:
    - OWNER: full gym control (billing, settings, destructive ops)
    - ADMIN: member management, day-to-day operations
    - STAFF: read access, check-ins, limited writes
    """

    async def _role_checker(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {', '.join(r.value for r in allowed_roles)}",
            )
        return current_user

    return _role_checker


# Convenience dependencies for common patterns
require_super_admin = require_role(UserRole.SUPER_ADMIN)
require_owner = require_role(UserRole.OWNER)
require_admin = require_role(UserRole.OWNER, UserRole.ADMIN)
require_staff = require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF)


def _set_log_context(user: CurrentUser) -> None:
    """Set request-scoped log context from authenticated user."""
    if user.gym_id:
        set_tenant_context(str(user.gym_id))
