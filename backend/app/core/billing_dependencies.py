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
from app.services.billing_service import (
    get_access_level,
    get_subscription,
    check_member_limit,
    check_staff_limit,
    check_feature_access,
)


async def require_active_subscription(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """
    Dependency that ensures the gym has an active (or trial) subscription.

    Blocks write operations for expired/locked gyms.
    Read-only check is handled separately (middleware or per-route).
    """
    if current_user.is_super_admin:
        return current_user

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
    Only active members count toward the limit.
    """
    if current_user.is_super_admin:
        return current_user

    limit_info = await check_member_limit(db, current_user.gym_id)

    if not limit_info["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Active member limit reached ({limit_info['max_members']} members). "
                   f"Upgrade your plan to add more members.",
            headers={"X-Limit-Type": "member", "X-Current": str(limit_info["current_members"]), "X-Max": str(limit_info["max_members"])},
        )

    return current_user


async def require_staff_capacity(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """
    Dependency that checks if the gym can add more staff accounts.

    Used on user creation endpoints to enforce plan limits.
    """
    if current_user.is_super_admin:
        return current_user

    limit_info = await check_staff_limit(db, current_user.gym_id)

    if not limit_info["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Staff account limit reached ({limit_info['max_staff']} accounts). "
                   f"Upgrade your plan to add more staff.",
            headers={"X-Limit-Type": "staff", "X-Current": str(limit_info["current_staff"]), "X-Max": str(limit_info["max_staff"])},
        )

    return current_user


def _feature_dependency(feature_name: str, display_name: str, required_plan: str):
    """Factory for feature-gating dependencies."""

    async def _check(
        current_user: CurrentUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> CurrentUser:
        if current_user.is_super_admin:
            return current_user

        result = await check_feature_access(db, current_user.gym_id, feature_name)

        if not result["allowed"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"{display_name} is available on the {required_plan.title()} plan and above. "
                       f"Upgrade to unlock this feature.",
                headers={"X-Feature": feature_name, "X-Required-Plan": required_plan},
            )

        return current_user

    _check.__name__ = f"require_{feature_name}"
    _check.__doc__ = f"Requires {display_name} feature (available in {required_plan}+ plans)."
    return _check


# Feature gate dependencies — use as route dependencies
require_qr_attendance = _feature_dependency("qr_attendance", "QR Attendance", "pro")
require_advanced_analytics = _feature_dependency("advanced_analytics", "Advanced Analytics", "pro")
require_export_reports = _feature_dependency("export_reports", "Export Reports", "pro")
require_multi_branch = _feature_dependency("multi_branch", "Multi-Branch Management", "elite")
require_automated_whatsapp = _feature_dependency("automated_whatsapp", "Automated WhatsApp Reminders", "elite")
