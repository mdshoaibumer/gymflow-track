"""
Subscription-aware dependencies for billing enforcement.

These complement the existing auth dependencies in core/dependencies.py.
They check the gym's subscription status and enforce access control.

Usage in routers:
    from app.core.billing_dependencies import require_active_subscription

    @router.post("/members", dependencies=[Depends(require_active_subscription)])
    async def create_member(...):
        ...
"""

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user
from app.services.billing_service import get_access_level, get_subscription, check_member_limit


async def require_active_subscription(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """
    Dependency that ensures the gym has an active (or trial) subscription.

    Blocks write operations for expired/locked gyms.
    Read-only check is handled separately (middleware or per-route).
    """
    subscription = await get_subscription(db, current_user.gym_id)
    access = get_access_level(subscription)

    if access == "locked":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your subscription has expired. Please resubscribe to continue.",
        )

    if access == "read_only":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your subscription is inactive. View-only access. Please update your payment.",
        )

    return current_user


async def require_member_capacity(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """
    Dependency that checks if the gym can add more members.

    Used on member creation endpoints to enforce plan limits.
    """
    limit_info = await check_member_limit(db, current_user.gym_id)

    if not limit_info["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Member limit reached ({limit_info['max_members']} members). Upgrade your plan to add more.",
        )

    return current_user
