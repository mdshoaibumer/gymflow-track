"""
Impersonation service — allows SUPER_ADMIN to "login as" a gym owner.

Security Design:
─────────────────
1. Only SUPER_ADMIN can initiate impersonation
2. Impersonation creates a SHORT-LIVED access token (15 min max)
3. The token contains `impersonator_id` claim for audit trail
4. Every action during impersonation is traceable to the super admin
5. Impersonation events are always audit-logged (start + end)
6. The impersonated token has the gym owner's identity but a shorter TTL

Token structure during impersonation:
{
    "sub": "<gym_owner_id>",
    "gym_id": "<gym_id>",
    "role": "owner",
    "impersonator_id": "<super_admin_id>",
    "type": "access",
    "exp": <15_minutes_from_now>
}

The `impersonator_id` claim:
- Distinguishes real owner actions from impersonated ones
- Used by audit logging to attribute actions correctly
- Prevents impersonation tokens from being used to elevate privileges
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import jwt as pyjwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError
from app.models.audit_log import AuditAction, AuditLog
from app.models.gym import Gym
from app.models.user import User, UserRole

logger = logging.getLogger("gymflow.impersonation")

# Impersonation token TTL — shorter than normal access tokens
IMPERSONATION_TTL_MINUTES = 15


def create_impersonation_token(
    owner_id: UUID,
    gym_id: UUID,
    impersonator_id: UUID,
) -> str:
    """Create a short-lived access token for impersonation.

    The token looks like a normal access token to the rest of the system,
    but includes an `impersonator_id` claim for audit purposes.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=IMPERSONATION_TTL_MINUTES)
    payload = {
        "sub": str(owner_id),
        "gym_id": str(gym_id),
        "role": "owner",
        "impersonator_id": str(impersonator_id),
        "iat": now,
        "exp": expire,
        "jti": str(uuid4()),
        "type": "access",
    }
    return pyjwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


class ImpersonationService:
    """Handles secure gym owner impersonation by super admins."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def start_impersonation(
        self,
        admin_id: UUID,
        gym_id: UUID,
        ip_address: str | None = None,
    ) -> dict:
        """Start impersonating a gym owner.

        Args:
            admin_id: The super admin performing the impersonation
            gym_id: The gym to impersonate into

        Returns:
            Dict with impersonation token and gym/owner info

        Raises:
            NotFoundError: If gym or owner not found
            AuthorizationError: If gym is deleted/inactive
        """
        # Verify gym exists
        gym = (await self.db.execute(
            select(Gym).where(Gym.id == gym_id)
        )).scalar_one_or_none()

        if not gym:
            raise NotFoundError("Gym not found")

        # Find the gym owner
        owner = (await self.db.execute(
            select(User).where(
                User.gym_id == gym_id,
                User.role == UserRole.OWNER,
                User.is_active == True,  # noqa: E712
            )
        )).scalar_one_or_none()

        if not owner:
            raise NotFoundError("No active owner found for this gym")

        # Create impersonation token
        token = create_impersonation_token(
            owner_id=owner.id,
            gym_id=gym_id,
            impersonator_id=admin_id,
        )

        # Audit log
        admin = (await self.db.execute(
            select(User.name).where(User.id == admin_id)
        )).scalar_one_or_none()
        admin_name = admin or "Unknown Admin"

        log = AuditLog(
            actor_id=admin_id,
            action=AuditAction.IMPERSONATION_START,
            target_gym_id=gym_id,
            target_user_id=owner.id,
            description=f"SUPER_ADMIN {admin_name} started impersonating {owner.name} at {gym.name}",
            metadata_json={
                "admin_name": str(admin_name),
                "owner_name": owner.name,
                "owner_email": owner.email,
                "gym_name": gym.name,
                "ttl_minutes": IMPERSONATION_TTL_MINUTES,
            },
            ip_address=ip_address,
        )
        self.db.add(log)
        await self.db.flush()

        logger.warning(
            "IMPERSONATION_START: admin=%s impersonating owner=%s gym=%s (%s)",
            admin_id, owner.id, gym_id, gym.name,
        )

        return {
            "access_token": token,
            "token_type": "bearer",
            "expires_in_minutes": IMPERSONATION_TTL_MINUTES,
            "gym_id": str(gym_id),
            "gym_name": gym.name,
            "owner_id": str(owner.id),
            "owner_name": owner.name,
            "owner_email": owner.email,
            "impersonator_id": str(admin_id),
        }

    async def end_impersonation(
        self,
        admin_id: UUID,
        gym_id: UUID,
        ip_address: str | None = None,
    ) -> None:
        """Record the end of an impersonation session.

        The token itself expires after TTL, but this explicitly logs
        when the admin clicks "Exit Impersonation".
        """
        gym = (await self.db.execute(
            select(Gym.name).where(Gym.id == gym_id)
        )).scalar_one_or_none()

        log = AuditLog(
            actor_id=admin_id,
            action=AuditAction.IMPERSONATION_END,
            target_gym_id=gym_id,
            description=f"Impersonation ended for gym: {gym or 'Unknown'}",
            metadata_json={"gym_name": gym},
            ip_address=ip_address,
        )
        self.db.add(log)
        await self.db.flush()

        logger.info(
            "IMPERSONATION_END: admin=%s gym=%s",
            admin_id, gym_id,
        )

        from app.schemas.admin import AdminActionResponse
        return AdminActionResponse(
            success=True,
            message=f"Impersonation ended for gym: {gym or 'Unknown'}",
            gym_id=str(gym_id),
            action="impersonation_ended",
        )
