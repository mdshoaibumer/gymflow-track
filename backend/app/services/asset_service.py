"""
Asset lifecycle and maintenance service.

Lifecycle Reasoning:
- ACTIVE: Equipment is working and available to members.
- UNDER_MAINTENANCE: Being serviced — visible on dashboard, not available.
- OUT_OF_SERVICE: Broken/unusable. Needs repair or replacement decision.
- RETIRED: Permanently removed from inventory. Kept for history/cost tracking.

Valid transitions:
  ACTIVE → UNDER_MAINTENANCE (service scheduled)
  ACTIVE → OUT_OF_SERVICE (unexpected breakdown)
  UNDER_MAINTENANCE → ACTIVE (service completed)
  UNDER_MAINTENANCE → OUT_OF_SERVICE (repair failed)
  OUT_OF_SERVICE → UNDER_MAINTENANCE (repair ordered)
  OUT_OF_SERVICE → RETIRED (write-off)
  Any non-retired → RETIRED (owner decision)

Operational Edge Cases:
- Recording maintenance auto-transitions asset to UNDER_MAINTENANCE if currently ACTIVE
- Completing maintenance returns asset to ACTIVE
- Cost tracking is append-only (maintenance records are never deleted)
- next_service_date on maintenance records drives the upcoming/overdue queries

Future Scalability:
- The service layer is independent of transport (API routes, scheduler jobs, etc.)
- Maintenance reminder scanning can be added as a scheduler job (like membership expiry)
- Warranty expiry alerts can be added to the existing notification system
"""

import logging
from datetime import date
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.timezone import today_ist

from app.core.exceptions import AlreadyExistsError, NotFoundError, ValidationError
from app.models.asset import (
    Asset,
    AssetCategory,
    AssetStatus,
    MaintenanceRecord,
    MaintenanceType,
)
from app.repositories.asset_repository import AssetRepository, MaintenanceRepository

logger = logging.getLogger("gymflow.assets")

# Valid status transitions
_VALID_TRANSITIONS: dict[AssetStatus, set[AssetStatus]] = {
    AssetStatus.ACTIVE: {
        AssetStatus.UNDER_MAINTENANCE,
        AssetStatus.OUT_OF_SERVICE,
        AssetStatus.RETIRED,
    },
    AssetStatus.UNDER_MAINTENANCE: {
        AssetStatus.ACTIVE,
        AssetStatus.OUT_OF_SERVICE,
        AssetStatus.RETIRED,
    },
    AssetStatus.OUT_OF_SERVICE: {
        AssetStatus.UNDER_MAINTENANCE,
        AssetStatus.RETIRED,
    },
    AssetStatus.RETIRED: set(),  # Terminal state
}


class AssetService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.asset_repo = AssetRepository(db)
        self.maintenance_repo = MaintenanceRepository(db)

    # === Asset CRUD ===

    # ************************************************************
    # Function Name : Register New Equipment Asset
    #
    # Purpose       : Creates a new equipment asset in the gym's
    # inventory with an initial ACTIVE status. Validates
    # that the asset code is unique within the gym to
    # prevent duplicate equipment entries.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
    async def create_asset(
        self,
        gym_id: UUID,
        name: str,
        asset_code: str,
        category: AssetCategory,
        manufacturer: str | None = None,
        serial_number: str | None = None,
        purchase_date: date | None = None,
        purchase_cost_in_paise: int | None = None,
        warranty_expiry: date | None = None,
        notes: str | None = None,
    ) -> Asset:
        """Create a new equipment asset. Asset code must be unique within the gym."""
        existing = await self.asset_repo.get_by_code(gym_id, asset_code)
        if existing:
            raise AlreadyExistsError(
                f"Asset with code '{asset_code}' already exists"
            )

        asset = Asset(
            gym_id=gym_id,
            name=name,
            asset_code=asset_code,
            category=category,
            manufacturer=manufacturer,
            serial_number=serial_number,
            purchase_date=purchase_date,
            purchase_cost_in_paise=purchase_cost_in_paise,
            warranty_expiry=warranty_expiry,
            notes=notes,
            status=AssetStatus.ACTIVE,
        )
        return await self.asset_repo.create(asset)

    # ************************************************************
    # Function Name : Update Equipment Asset Details
    #
    # Purpose       : Modifies equipment metadata (name, manufacturer,
    # notes, etc.) without changing the lifecycle
    # status. Asset code changes are validated for
    # uniqueness within the gym.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
    async def update_asset(
        self,
        gym_id: UUID,
        asset_id: UUID,
        **updates,
    ) -> Asset:
        """Update asset details (not status — use update_status for that)."""
        asset = await self.asset_repo.get_by_id(asset_id, gym_id)
        if not asset:
            raise NotFoundError("Asset not found")

        # If asset_code is being changed, check uniqueness
        new_code = updates.get("asset_code")
        if new_code and new_code != asset.asset_code:
            existing = await self.asset_repo.get_by_code(gym_id, new_code)
            if existing:
                raise AlreadyExistsError(
                    f"Asset with code '{new_code}' already exists"
                )

        allowed_fields = {
            "name", "asset_code", "category", "manufacturer",
            "serial_number", "purchase_date", "purchase_cost_in_paise",
            "warranty_expiry", "notes",
        }
        for field, value in updates.items():
            if field in allowed_fields and value is not None:
                setattr(asset, field, value)

        await self.db.flush()
        return asset

    async def update_status(
        self, gym_id: UUID, asset_id: UUID, new_status: AssetStatus
    ) -> Asset:
        """
        Transition asset to a new status.
        Validates the transition is allowed (e.g., RETIRED is terminal).
        """
        asset = await self.asset_repo.get_by_id(asset_id, gym_id)
        if not asset:
            raise NotFoundError("Asset not found")

        if asset.status == new_status:
            return asset  # No-op

        valid_next = _VALID_TRANSITIONS.get(asset.status, set())
        if new_status not in valid_next:
            raise ValidationError(
                f"Cannot transition from '{asset.status.value}' to '{new_status.value}'"
            )

        asset.status = new_status
        await self.db.flush()
        logger.info(
            f"Asset {asset_id} status: {asset.status.value} → {new_status.value}"
        )
        return asset

    async def delete_asset(self, gym_id: UUID, asset_id: UUID) -> None:
        """Delete an asset. Only RETIRED assets can be deleted (safety guard)."""
        asset = await self.asset_repo.get_by_id(asset_id, gym_id)
        if not asset:
            raise NotFoundError("Asset not found")
        if asset.status != AssetStatus.RETIRED:
            raise ValidationError(
                "Only retired assets can be deleted. Retire the asset first."
            )
        await self.asset_repo.delete(asset)

    # === Maintenance ===

    async def record_maintenance(
        self,
        gym_id: UUID,
        asset_id: UUID,
        maintenance_type: MaintenanceType,
        service_date: date,
        performed_by: UUID | None = None,
        next_service_date: date | None = None,
        cost_in_paise: int = 0,
        vendor_name: str | None = None,
        notes: str | None = None,
    ) -> MaintenanceRecord:
        """
        Record a maintenance event for an asset.

        Business rules:
        - Asset must exist in this gym
        - If asset is ACTIVE, auto-transition to UNDER_MAINTENANCE
        - RETIRED assets cannot receive maintenance
        - Cost must be non-negative
        """
        asset = await self.asset_repo.get_by_id(asset_id, gym_id)
        if not asset:
            raise NotFoundError("Asset not found")

        if asset.status == AssetStatus.RETIRED:
            raise ValidationError("Cannot record maintenance for a retired asset")

        if cost_in_paise < 0:
            raise ValidationError("Cost cannot be negative")

        # Auto-transition to UNDER_MAINTENANCE if currently ACTIVE
        if asset.status == AssetStatus.ACTIVE:
            asset.status = AssetStatus.UNDER_MAINTENANCE
            await self.db.flush()

        record = MaintenanceRecord(
            gym_id=gym_id,
            asset_id=asset_id,
            maintenance_type=maintenance_type,
            service_date=service_date,
            next_service_date=next_service_date,
            cost_in_paise=cost_in_paise,
            vendor_name=vendor_name,
            notes=notes,
            performed_by=performed_by,
        )
        return await self.maintenance_repo.create(record)

    async def complete_maintenance(
        self, gym_id: UUID, asset_id: UUID
    ) -> Asset:
        """
        Mark an asset as maintenance-complete → return to ACTIVE.
        Only assets currently UNDER_MAINTENANCE can be completed.
        """
        asset = await self.asset_repo.get_by_id(asset_id, gym_id)
        if not asset:
            raise NotFoundError("Asset not found")

        if asset.status != AssetStatus.UNDER_MAINTENANCE:
            raise ValidationError("Asset is not currently under maintenance")

        asset.status = AssetStatus.ACTIVE
        await self.db.flush()
        return asset

    # === Dashboard Queries ===

    async def get_dashboard_stats(self, gym_id: UUID) -> dict:
        """Aggregated equipment stats for the dashboard."""
        today = today_ist()
        month_start = today.replace(day=1)
        # Last day of month
        if today.month == 12:
            month_end = today.replace(year=today.year + 1, month=1, day=1)
        else:
            month_end = today.replace(month=today.month + 1, day=1)

        status_counts = await self.asset_repo.count_by_status(gym_id)
        upcoming = await self.maintenance_repo.count_upcoming(gym_id, today)
        overdue = await self.maintenance_repo.count_overdue(gym_id, today)
        month_cost = await self.maintenance_repo.total_cost_this_month(
            gym_id, month_start, month_end
        )

        return {
            "active_count": status_counts.get("active", 0),
            "under_maintenance_count": status_counts.get("under_maintenance", 0),
            "out_of_service_count": status_counts.get("out_of_service", 0),
            "retired_count": status_counts.get("retired", 0),
            "total_count": sum(status_counts.values()),
            "upcoming_maintenance": upcoming,
            "overdue_maintenance": overdue,
            "maintenance_cost_this_month_paise": month_cost,
        }
