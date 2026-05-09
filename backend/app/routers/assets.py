"""
Asset and Maintenance API routes.

RBAC:
- GET endpoints: All authenticated roles (STAFF can view equipment)
- POST/PUT (create, update, record maintenance): ADMIN+
- DELETE (remove asset): OWNER only
- Status transitions: ADMIN+
"""

from uuid import UUID
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_admin, require_owner
from app.models.asset import AssetCategory, AssetStatus
from app.core.timezone import today_ist
from app.repositories.asset_repository import AssetRepository, MaintenanceRepository
from app.schemas.asset import (
    AssetDashboardStats,
    AssetListResponse,
    AssetResponse,
    CreateAssetRequest,
    CreateMaintenanceRequest,
    MaintenanceListResponse,
    MaintenanceResponse,
    UpdateAssetRequest,
    UpdateAssetStatusRequest,
)
from app.services.asset_service import AssetService

logger = logging.getLogger("gymflow.audit")

router = APIRouter()


# === Asset CRUD ===


@router.post("", response_model=AssetResponse, status_code=201)
async def create_asset(
    body: CreateAssetRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new equipment asset. ADMIN/OWNER only."""
    service = AssetService(db)
    asset = await service.create_asset(
        gym_id=current_user.gym_id,
        **body.model_dump(),
    )
    return asset


@router.get("", response_model=AssetListResponse)
async def list_assets(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: AssetStatus | None = Query(None),
    category: AssetCategory | None = Query(None),
    search: str | None = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List assets for the current gym. Supports filtering and search."""
    repo = AssetRepository(db)
    assets = await repo.list_by_gym(
        current_user.gym_id, skip, limit, status, category, search
    )
    total = await repo.count_by_gym(
        current_user.gym_id, status, category, search
    )
    return AssetListResponse(assets=assets, total=total)


@router.get("/stats", response_model=AssetDashboardStats)
async def get_asset_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Equipment dashboard stats: counts by status, upcoming/overdue, costs."""
    service = AssetService(db)
    return await service.get_dashboard_stats(current_user.gym_id)


# --- Maintenance dashboard routes MUST be before /{asset_id} ---


@router.get("/maintenance/upcoming", response_model=MaintenanceListResponse)
async def get_upcoming_maintenance(
    days: int = Query(30, ge=1, le=90),
    limit: int = Query(20, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get maintenance records with upcoming next_service_date."""
    today = today_ist()
    repo = MaintenanceRepository(db)
    records = await repo.get_upcoming(current_user.gym_id, today, days, limit)
    count = await repo.count_upcoming(current_user.gym_id, today, days)
    return MaintenanceListResponse(records=records, total=count)


@router.get("/maintenance/overdue", response_model=MaintenanceListResponse)
async def get_overdue_maintenance(
    limit: int = Query(20, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get maintenance records that are past their next_service_date."""
    today = today_ist()
    repo = MaintenanceRepository(db)
    records = await repo.get_overdue(current_user.gym_id, today, limit)
    count = await repo.count_overdue(current_user.gym_id, today)
    return MaintenanceListResponse(records=records, total=count)


# --- Asset detail routes (/{asset_id}) below ---


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single asset by ID."""
    from app.core.exceptions import NotFoundError

    repo = AssetRepository(db)
    asset = await repo.get_by_id(asset_id, current_user.gym_id)
    if not asset:
        raise NotFoundError("Asset not found")
    return asset


@router.put("/{asset_id}", response_model=AssetResponse)
async def update_asset(
    asset_id: UUID,
    body: UpdateAssetRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update asset details. ADMIN/OWNER only."""
    service = AssetService(db)
    updates = body.model_dump(exclude_unset=True)
    return await service.update_asset(current_user.gym_id, asset_id, **updates)


@router.put("/{asset_id}/status", response_model=AssetResponse)
async def update_asset_status(
    asset_id: UUID,
    body: UpdateAssetStatusRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Transition asset to a new status. Validates allowed transitions."""
    service = AssetService(db)
    return await service.update_status(current_user.gym_id, asset_id, body.status)


@router.post("/{asset_id}/complete-maintenance", response_model=AssetResponse)
async def complete_maintenance(
    asset_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Mark asset maintenance as complete → return to ACTIVE."""
    service = AssetService(db)
    return await service.complete_maintenance(current_user.gym_id, asset_id)


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: UUID,
    current_user: CurrentUser = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Delete a retired asset. OWNER only. Asset must be RETIRED first."""
    service = AssetService(db)
    await service.delete_asset(current_user.gym_id, asset_id)
    logger.info(
        "asset_deleted gym_id=%s asset_id=%s by_user=%s",
        current_user.gym_id, asset_id, current_user.user_id,
    )


# === Maintenance Records ===


@router.post("/{asset_id}/maintenance", response_model=MaintenanceResponse, status_code=201)
async def record_maintenance(
    asset_id: UUID,
    body: CreateMaintenanceRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Record a maintenance event. ADMIN/OWNER only.
    Auto-transitions ACTIVE assets to UNDER_MAINTENANCE.
    """
    service = AssetService(db)
    record = await service.record_maintenance(
        gym_id=current_user.gym_id,
        asset_id=asset_id,
        performed_by=current_user.user_id,
        **body.model_dump(),
    )
    return record


@router.get("/{asset_id}/maintenance", response_model=MaintenanceListResponse)
async def list_asset_maintenance(
    asset_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get maintenance history for a specific asset."""
    repo = MaintenanceRepository(db)
    records = await repo.list_by_asset(asset_id, current_user.gym_id, skip, limit)
    total = await repo.count_by_asset(asset_id, current_user.gym_id)
    return MaintenanceListResponse(records=records, total=total)
