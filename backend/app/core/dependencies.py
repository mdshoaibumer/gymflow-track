import time
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_token
from app.middleware.request_context import set_tenant_context
from app.models.user import UserRole

security_scheme = HTTPBearer()

# Lightweight cache: {user_id_str: (is_active, timestamp)}
# Prevents disabled/deleted users from using valid access tokens for up to 60s.
# Trade-off: DB lookup once per 60s instead of every request.
_user_active_cache: dict[str, tuple[bool, float]] = {}
_USER_CACHE_TTL = 60  # seconds
_USER_CACHE_MAX_SIZE = 5000


class CurrentUser:
    """Represents the authenticated user extracted from JWT."""

    def __init__(self, user_id: UUID, gym_id: UUID, role: UserRole):
        self.user_id = user_id
        self.gym_id = gym_id
        self.role = role

    @property
    def is_owner(self) -> bool:
        return self.role == UserRole.OWNER

    @property
    def is_admin_or_above(self) -> bool:
        return self.role in (UserRole.OWNER, UserRole.ADMIN)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
) -> CurrentUser:
    """Extract and validate the current user from the JWT access token.

    Additionally checks a lightweight cache to detect disabled/deleted users
    within ~60 seconds of account changes (instead of only on token expiry).
    """
    token = credentials.credentials
    payload = decode_token(token)

    if payload is None or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    try:
        role = UserRole(payload["role"])
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
        )

    user_id = UUID(payload["sub"])
    gym_id = UUID(payload["gym_id"])

    # Lightweight active-user check (cached, not every request hits DB)
    await _check_user_active(user_id)

    user = CurrentUser(
        user_id=user_id,
        gym_id=gym_id,
        role=role,
    )
    _set_log_context(user)
    return user


async def _check_user_active(user_id: UUID) -> None:
    """Check if user is still active using a time-based cache."""
    uid_str = str(user_id)
    now = time.time()

    # Check cache
    cached = _user_active_cache.get(uid_str)
    if cached and now - cached[1] < _USER_CACHE_TTL:
        if not cached[0]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is disabled",
            )
        return

    # Cache miss — query DB
    from app.core.database import async_session_factory
    from sqlalchemy import select
    from app.models.user import User

    try:
        async with async_session_factory() as session:
            result = await session.execute(
                select(User.is_active).where(User.id == user_id)
            )
            row = result.scalar_one_or_none()
            is_active = bool(row) if row is not None else False

            # Evict stale entries if cache is too large
            if len(_user_active_cache) >= _USER_CACHE_MAX_SIZE:
                stale = [k for k, (_, ts) in _user_active_cache.items() if now - ts > _USER_CACHE_TTL]
                for k in stale:
                    del _user_active_cache[k]

            _user_active_cache[uid_str] = (is_active, now)

            if not is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Account is disabled",
                )
    except HTTPException:
        raise
    except Exception:
        # DB error — don't block the request, let downstream handle it
        pass


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
require_owner = require_role(UserRole.OWNER)
require_admin = require_role(UserRole.OWNER, UserRole.ADMIN)
require_staff = require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF)


def _set_log_context(user: CurrentUser) -> None:
    """Set request-scoped log context from authenticated user."""
    set_tenant_context(str(user.gym_id))
