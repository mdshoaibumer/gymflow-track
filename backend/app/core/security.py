from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ************************************************************
# Function Name : Hash User Password
#
# Purpose       : Generates a bcrypt hash of the user's plaintext
# password for secure database storage. Uses the
# passlib CryptContext with automatic salt generation.
#
# Author        : Mohammed Shoaib U
#
# ************************************************************
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


# ************************************************************
# Function Name : Verify User Password
#
# Purpose       : Compares a plaintext password attempt against the
# stored bcrypt hash. Returns True if the password
# matches, False otherwise. Uses constant-time
# comparison internally to prevent timing attacks.
#
# Author        : Mohammed Shoaib U
#
# ************************************************************
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ************************************************************
# Function Name : Create Short-Lived Access Token
#
# Purpose       : Generates a JWT access token containing the user's
# identity, gym scope, and role. Expires after a
# configurable period (default 30 min). The role is
# embedded in the token to eliminate per-request DB
# lookups for authorization checks.
#
# Author        : Mohammed Shoaib U
#
# ************************************************************
def create_access_token(user_id: UUID, gym_id: UUID, role: str) -> str:
    """
    Create a short-lived access token containing identity + role.

    Why role is in the JWT:
    - Eliminates a DB query on every authenticated request
    - Role changes take effect on next token refresh (max 30 min stale)
    - Acceptable tradeoff for a gym SaaS where role changes are rare
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "gym_id": str(gym_id),
        "role": role,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


# ************************************************************
# Function Name : Create Long-Lived Refresh Token
#
# Purpose       : Generates a JWT refresh token for session
# continuity. Expires after a configurable period
# (default 7 days). Used to obtain new access tokens
# without requiring the user to re-enter credentials.
#
# Author        : Mohammed Shoaib U
#
# ************************************************************
def create_refresh_token(user_id: UUID, gym_id: UUID, role: str) -> str:
    """
    Create a long-lived refresh token.

    Role is included so that refresh responses can mint accurate access tokens
    without a DB lookup — but the refresh endpoint still validates user state.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": str(user_id),
        "gym_id": str(gym_id),
        "role": role,
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


# ************************************************************
# Function Name : Decode and Validate JWT Token
#
# Purpose       : Decodes a JWT token and validates its signature
# and expiration. Returns the payload dict if valid,
# None if the token is expired, tampered, or
# malformed. Used by both access and refresh token
# validation paths.
#
# Author        : Mohammed Shoaib U
#
# ************************************************************
def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError:
        return None
