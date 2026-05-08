from datetime import date
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import (
    Asset,
    AssetCategory,
    AssetStatus,
    MaintenanceRecord,
)


class AssetRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # === Asset CRUD ===

    async def create(self, asset: Asset) -> Asset:
        self.db.add(asset)
        await self.db.flush()
        return asset

    async def get_by_id(self, asset_id: UUID, gym_id: UUID) -> Asset | None:
        result = await self.db.execute(
            select(Asset).where(Asset.id == asset_id, Asset.gym_id == gym_id)
        )
        return result.scalar_one_or_none()

    async def get_by_code(self, gym_id: UUID, asset_code: str) -> Asset | None:
        result = await self.db.execute(
            select(Asset).where(
                Asset.gym_id == gym_id, Asset.asset_code == asset_code
            )
        )
        return result.scalar_one_or_none()

    async def list_by_gym(
        self,
        gym_id: UUID,
        skip: int = 0,
        limit: int = 50,
        status: AssetStatus | None = None,
        category: AssetCategory | None = None,
        search: str | None = None,
    ) -> list[Asset]:
        query = select(Asset).where(Asset.gym_id == gym_id)
        if status:
            query = query.where(Asset.status == status)
        if category:
            query = query.where(Asset.category == category)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                Asset.name.ilike(pattern) | Asset.asset_code.ilike(pattern)
            )
        result = await self.db.execute(
            query.order_by(Asset.name.asc()).offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def count_by_gym(
        self,
        gym_id: UUID,
        status: AssetStatus | None = None,
        category: AssetCategory | None = None,
        search: str | None = None,
    ) -> int:
        query = (
            select(func.count()).select_from(Asset).where(Asset.gym_id == gym_id)
        )
        if status:
            query = query.where(Asset.status == status)
        if category:
            query = query.where(Asset.category == category)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                Asset.name.ilike(pattern) | Asset.asset_code.ilike(pattern)
            )
        result = await self.db.execute(query)
        return result.scalar_one()

    async def count_by_status(self, gym_id: UUID) -> dict[str, int]:
        """Count assets grouped by status for dashboard."""
        result = await self.db.execute(
            select(Asset.status, func.count().label("count"))
            .where(Asset.gym_id == gym_id)
            .group_by(Asset.status)
        )
        return {row.status.value: row.count for row in result.all()}

    async def delete(self, asset: Asset) -> None:
        await self.db.delete(asset)
        await self.db.flush()


class MaintenanceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, record: MaintenanceRecord) -> MaintenanceRecord:
        self.db.add(record)
        await self.db.flush()
        return record

    async def get_by_id(
        self, record_id: UUID, gym_id: UUID
    ) -> MaintenanceRecord | None:
        result = await self.db.execute(
            select(MaintenanceRecord).where(
                MaintenanceRecord.id == record_id,
                MaintenanceRecord.gym_id == gym_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_asset(
        self, asset_id: UUID, gym_id: UUID, skip: int = 0, limit: int = 20
    ) -> list[MaintenanceRecord]:
        result = await self.db.execute(
            select(MaintenanceRecord)
            .where(
                MaintenanceRecord.asset_id == asset_id,
                MaintenanceRecord.gym_id == gym_id,
            )
            .order_by(MaintenanceRecord.service_date.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_by_asset(self, asset_id: UUID, gym_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(MaintenanceRecord)
            .where(
                MaintenanceRecord.asset_id == asset_id,
                MaintenanceRecord.gym_id == gym_id,
            )
        )
        return result.scalar_one()

    async def get_upcoming(
        self, gym_id: UUID, as_of: date, days_ahead: int = 30, limit: int = 20
    ) -> list[MaintenanceRecord]:
        """Get maintenance records with next_service_date within the window."""
        from datetime import timedelta

        end = as_of + timedelta(days=days_ahead)
        result = await self.db.execute(
            select(MaintenanceRecord)
            .where(
                MaintenanceRecord.gym_id == gym_id,
                MaintenanceRecord.next_service_date != None,
                MaintenanceRecord.next_service_date >= as_of,
                MaintenanceRecord.next_service_date <= end,
            )
            .order_by(MaintenanceRecord.next_service_date.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_overdue(
        self, gym_id: UUID, as_of: date, limit: int = 20
    ) -> list[MaintenanceRecord]:
        """Get maintenance records where next_service_date has passed."""
        result = await self.db.execute(
            select(MaintenanceRecord)
            .where(
                MaintenanceRecord.gym_id == gym_id,
                MaintenanceRecord.next_service_date != None,
                MaintenanceRecord.next_service_date < as_of,
            )
            .order_by(MaintenanceRecord.next_service_date.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def total_cost_this_month(
        self, gym_id: UUID, month_start: date, month_end: date
    ) -> int:
        """Sum maintenance costs for the current month (in paise)."""
        result = await self.db.execute(
            select(func.coalesce(func.sum(MaintenanceRecord.cost_in_paise), 0))
            .where(
                MaintenanceRecord.gym_id == gym_id,
                MaintenanceRecord.service_date >= month_start,
                MaintenanceRecord.service_date <= month_end,
            )
        )
        return result.scalar_one()

    async def count_upcoming(
        self, gym_id: UUID, as_of: date, days_ahead: int = 30
    ) -> int:
        from datetime import timedelta

        end = as_of + timedelta(days=days_ahead)
        result = await self.db.execute(
            select(func.count())
            .select_from(MaintenanceRecord)
            .where(
                MaintenanceRecord.gym_id == gym_id,
                MaintenanceRecord.next_service_date != None,
                MaintenanceRecord.next_service_date >= as_of,
                MaintenanceRecord.next_service_date <= end,
            )
        )
        return result.scalar_one()

    async def count_overdue(self, gym_id: UUID, as_of: date) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(MaintenanceRecord)
            .where(
                MaintenanceRecord.gym_id == gym_id,
                MaintenanceRecord.next_service_date != None,
                MaintenanceRecord.next_service_date < as_of,
            )
        )
        return result.scalar_one()
