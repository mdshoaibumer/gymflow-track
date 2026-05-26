"""
Super Admin API routes — platform management endpoints.

All routes require SUPER_ADMIN role.
No gym_id tenant scoping — super admins see all gyms.

Security:
- Every route requires JWT with role=super_admin
- All mutations are audit-logged
- IP addresses are captured for audit trail
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import CurrentUser, require_super_admin
from app.schemas.admin import (
    AdminActionResponse,
    AuditLogResponse,
    ChangePlanRequest,
    DeleteGymRequest,
    ExtendTrialRequest,
    GrantAccessRequest,
    GymDetailResponse,
    GymDirectoryResponse,
    ImpersonationResponse,
    LockGymRequest,
    PlatformAnalyticsResponse,
    PlatformHealthResponse,
    PlatformSettingsResponse,
    SaaSMetricsResponse,
    SuspendGymRequest,
    UnlockGymRequest,
    UnsuspendGymRequest,
    UpdatePlatformSettingsRequest,
)
from app.services.admin_service import AdminService
from app.services.impersonation_service import ImpersonationService

logger = logging.getLogger("gymflow.admin")

router = APIRouter()


def _get_client_ip(request: Request) -> str:
    """Extract client IP (proxy-aware)."""
    if settings.TRUST_PROXY_HEADERS:
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# === Dashboard Metrics ===


@router.get("/metrics", response_model=SaaSMetricsResponse)
async def get_saas_metrics(
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Platform-wide SaaS metrics. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.get_saas_metrics()


# === Gym Directory ===


@router.get("/gyms", response_model=GymDirectoryResponse)
async def list_gyms(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: str | None = Query(None, min_length=1, max_length=100),
    status: str | None = Query(None, pattern="^(active|trial|expired|suspended)$"),
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all gyms with subscription and member data. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.list_gyms(
        skip=skip, limit=limit, search=search, status_filter=status,
    )


# === Gym Details ===


@router.get("/gyms/{gym_id}", response_model=GymDetailResponse)
async def get_gym_detail(
    gym_id: UUID,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Full gym details page. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.get_gym_detail(gym_id)


# === Admin Actions ===


@router.post("/gyms/{gym_id}/extend-trial", response_model=AdminActionResponse)
async def extend_trial(
    gym_id: UUID,
    data: ExtendTrialRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Extend a gym's trial period. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.extend_trial(
        gym_id=gym_id,
        days=data.days,
        reason=data.reason,
        actor_id=current_user.user_id,
        ip_address=_get_client_ip(request),
    )


@router.post("/gyms/{gym_id}/suspend", response_model=AdminActionResponse)
async def suspend_gym(
    gym_id: UUID,
    data: SuspendGymRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Suspend a gym. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.suspend_gym(
        gym_id=gym_id,
        reason=data.reason,
        actor_id=current_user.user_id,
        ip_address=_get_client_ip(request),
    )


@router.post("/gyms/{gym_id}/unsuspend", response_model=AdminActionResponse)
async def unsuspend_gym(
    gym_id: UUID,
    data: UnsuspendGymRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Unsuspend a gym. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.unsuspend_gym(
        gym_id=gym_id,
        reason=data.reason,
        actor_id=current_user.user_id,
        ip_address=_get_client_ip(request),
    )


@router.post("/gyms/{gym_id}/lock", response_model=AdminActionResponse)
async def lock_gym(
    gym_id: UUID,
    data: LockGymRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Lock a gym (expire subscription). SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.lock_gym(
        gym_id=gym_id,
        reason=data.reason,
        actor_id=current_user.user_id,
        ip_address=_get_client_ip(request),
    )


@router.post("/gyms/{gym_id}/unlock", response_model=AdminActionResponse)
async def unlock_gym(
    gym_id: UUID,
    data: UnlockGymRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Unlock a gym and restore subscription. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.unlock_gym(
        gym_id=gym_id,
        new_status=data.new_status,
        reason=data.reason,
        actor_id=current_user.user_id,
        ip_address=_get_client_ip(request),
    )


@router.post("/gyms/{gym_id}/change-plan", response_model=AdminActionResponse)
async def change_plan(
    gym_id: UUID,
    data: ChangePlanRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Change a gym's plan tier. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.change_plan(
        gym_id=gym_id,
        plan_tier=data.plan_tier,
        reason=data.reason,
        actor_id=current_user.user_id,
        ip_address=_get_client_ip(request),
    )


@router.post("/gyms/{gym_id}/activate", response_model=AdminActionResponse)
async def activate_subscription(
    gym_id: UUID,
    request: Request,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Manually activate a gym's subscription. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.activate_subscription(
        gym_id=gym_id,
        actor_id=current_user.user_id,
        ip_address=_get_client_ip(request),
    )


@router.post("/gyms/{gym_id}/grant-access", response_model=AdminActionResponse)
async def grant_access(
    gym_id: UUID,
    data: GrantAccessRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Grant a gym full access for a specified duration. SUPER_ADMIN only.

    This activates the subscription and extends the period end date
    by the specified number of days. Useful for giving complimentary
    access, handling payment disputes, or onboarding partner gyms.
    """
    service = AdminService(db)
    return await service.grant_access(
        gym_id=gym_id,
        days=data.days,
        reason=data.reason,
        actor_id=current_user.user_id,
        ip_address=_get_client_ip(request),
    )


# === Audit Logs ===


@router.get("/audit-logs", response_model=AuditLogResponse)
async def get_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    gym_id: UUID | None = Query(None),
    action: str | None = Query(None),
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """View audit logs. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.get_audit_logs(
        skip=skip, limit=limit, gym_id=gym_id, action_filter=action,
    )


# === Delete Gym ===


@router.delete("/gyms/{gym_id}", response_model=AdminActionResponse)
async def delete_gym(
    gym_id: UUID,
    data: DeleteGymRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a gym and all data. SUPER_ADMIN only. DESTRUCTIVE."""
    service = AdminService(db)
    return await service.delete_gym(
        gym_id=gym_id,
        confirm_name=data.confirm_name,
        reason=data.reason,
        actor_id=current_user.user_id,
        ip_address=_get_client_ip(request),
    )


# === Impersonation ===


@router.post("/gyms/{gym_id}/impersonate", response_model=ImpersonationResponse)
async def impersonate_gym_owner(
    gym_id: UUID,
    request: Request,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Start impersonation session as gym owner. SUPER_ADMIN only."""
    service = ImpersonationService(db)
    return await service.start_impersonation(
        admin_id=current_user.user_id,
        gym_id=gym_id,
        ip_address=_get_client_ip(request),
    )


@router.post("/gyms/{gym_id}/end-impersonation", response_model=AdminActionResponse)
async def end_impersonation(
    gym_id: UUID,
    request: Request,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """End impersonation session. SUPER_ADMIN only."""
    service = ImpersonationService(db)
    return await service.end_impersonation(
        admin_id=current_user.user_id,
        gym_id=gym_id,
        ip_address=_get_client_ip(request),
    )


# === Platform Analytics ===


@router.get("/analytics", response_model=PlatformAnalyticsResponse)
async def get_platform_analytics(
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Global platform analytics. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.get_platform_analytics()


# === Platform Health ===


@router.get("/health", response_model=PlatformHealthResponse)
async def get_platform_health(
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Platform health monitoring. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.get_platform_health()


# === Platform Settings ===


@router.get("/settings", response_model=PlatformSettingsResponse)
async def get_platform_settings(
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get platform settings. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.get_platform_settings()


@router.put("/settings", response_model=PlatformSettingsResponse)
async def update_platform_settings(
    data: UpdatePlatformSettingsRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update platform settings. SUPER_ADMIN only."""
    service = AdminService(db)
    return await service.update_platform_settings(
        data=data,
        actor_id=current_user.user_id,
        ip_address=_get_client_ip(request),
    )
