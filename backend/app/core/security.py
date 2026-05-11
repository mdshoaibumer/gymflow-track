from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from jwt import InvalidTokenError
import jwt as pyjwt

from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: UUID, gym_id: UUID | None, role: str) -> str:
    """
    Create a short-lived access token containing identity + role.

    Why role is in the JWT:
    - Eliminates a DB query on every authenticated request
    - Role changes take effect on next token refresh (max 30 min stale)
    - Acceptable tradeoff for a gym SaaS where role changes are rare

    Super admins have gym_id=None — the JWT omits gym_id for them.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": expire,
        "jti": str(uuid4()),
        "type": "access",
    }
    if gym_id is not None:
        payload["gym_id"] = str(gym_id)
    return pyjwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: UUID, gym_id: UUID | None, role: str) -> str:
    """
    Create a long-lived refresh token.

    Role is included so that refresh responses can mint accurate access tokens
    without a DB lookup — but the refresh endpoint still validates user state.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": expire,
        "jti": str(uuid4()),
        "type": "refresh",
    }
    if gym_id is not None:
        payload["gym_id"] = str(gym_id)
    return pyjwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        payload = pyjwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except InvalidTokenError:
        return None
