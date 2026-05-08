from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token

security_scheme = HTTPBearer()


class CurrentUser:
    """Represents the authenticated user extracted from JWT."""

    def __init__(self, user_id: UUID, gym_id: UUID):
        self.user_id = user_id
        self.gym_id = gym_id


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
) -> CurrentUser:
    token = credentials.credentials
    payload = decode_token(token)

    if payload is None or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    return CurrentUser(
        user_id=UUID(payload["sub"]),
        gym_id=UUID(payload["gym_id"]),
    )


def get_db_session():
    """Alias for get_db — makes dependency injection explicit in routers."""
    return Depends(get_db)
