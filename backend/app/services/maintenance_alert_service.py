"""
Maintenance reminder detection — identifies overdue and upcoming service needs.

Reminder Strategy:
- Scans maintenance_records for overdue next_service_date (past due)
- Scans assets for warranty_expiry approaching (within 30 days)
- Returns structured results for the dashboard/API — does NOT create notifications
  (maintenance reminders are displayed inline, not sent via WhatsApp)

Why not reuse the notification system:
- WhatsApp messages for "treadmill needs oiling" would annoy gym owners
- Maintenance reminders are DASHBOARD-VISIBLE alerts, not outbound messages
- This keeps the notification system focused on member-facing messages
- If a gym later wants WhatsApp alerts for equipment, the service layer is ready

Operational Reliability:
- All queries are tenant-scoped (gym_id)
- Overdue detection uses simple date comparison (no timezone complexity)
- Warranty expiry is a date-only field — no partial-day issues
"""

import logging
from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset, AssetStatus
from app.repositories.asset_repository import MaintenanceRepository
from app.core.timezone import today_ist

logger = logging.getLogger("gymflow.maintenance")


class MaintenanceAlertService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.maintenance_repo = MaintenanceRepository(db)

    async def get_warranty_expiring(
        self, gym_id: UUID, days_ahead: int = 30
    ) -> list[Asset]:
        """Get assets with warranty expiring within the next N days."""
        today = today_ist()
        cutoff = today + timedelta(days=days_ahead)
        result = await self.db.execute(
            select(Asset).where(
                Asset.gym_id == gym_id,
                Asset.warranty_expiry.isnot(None),
                Asset.warranty_expiry >= today,
                Asset.warranty_expiry <= cutoff,
                Asset.status != AssetStatus.RETIRED,
            )
            .order_by(Asset.warranty_expiry.asc())
        )
        return list(result.scalars().all())

    async def get_warranty_expired(self, gym_id: UUID) -> list[Asset]:
        """Get non-retired assets with expired warranty."""
        today = today_ist()
        result = await self.db.execute(
            select(Asset).where(
                Asset.gym_id == gym_id,
                Asset.warranty_expiry.isnot(None),
                Asset.warranty_expiry < today,
                Asset.status != AssetStatus.RETIRED,
            )
            .order_by(Asset.warranty_expiry.asc())
        )
        return list(result.scalars().all())

    async def get_alerts_summary(self, gym_id: UUID) -> dict:
        """
        Get a combined alerts summary for the dashboard.
        Returns counts and lists for overdue maintenance, warranty expiry, etc.
        """
        today = today_ist()

        overdue_count = await self.maintenance_repo.count_overdue(gym_id, today)
        upcoming_count = await self.maintenance_repo.count_upcoming(gym_id, today)
        warranty_expiring = await self.get_warranty_expiring(gym_id)

        return {
            "overdue_maintenance_count": overdue_count,
            "upcoming_maintenance_count": upcoming_count,
            "warranty_expiring_count": len(warranty_expiring),
            "warranty_expiring_assets": [
                {
                    "id": str(a.id),
                    "name": a.name,
                    "asset_code": a.asset_code,
                    "warranty_expiry": a.warranty_expiry.isoformat(),
                }
                for a in warranty_expiring[:5]  # Top 5 for dashboard
            ],
        }
