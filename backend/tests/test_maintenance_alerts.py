"""
Tests for app.services.maintenance_alert_service — maintenance/warranty alerts.

Coverage:
1. get_warranty_expiring returns assets within window
2. get_warranty_expired returns overdue assets
3. get_alerts_summary aggregates counts
"""

import asyncio
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.maintenance_alert_service import MaintenanceAlertService


def _run(coro):
    """Helper to run an async function synchronously in tests."""
    return asyncio.run(coro)


class TestWarrantyExpiring:
    """get_warranty_expiring queries within days_ahead window."""

    def test_returns_assets_within_window(self):
        mock_db = AsyncMock()
        service = MaintenanceAlertService(mock_db)

        # Mock the query result
        asset1 = MagicMock()
        asset1.name = "Treadmill"
        asset1.warranty_expiry = date(2026, 6, 1)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [asset1]
        mock_db.execute = AsyncMock(return_value=mock_result)

        gym_id = uuid4()
        assets = _run(service.get_warranty_expiring(gym_id, days_ahead=30))
        assert len(assets) == 1
        assert assets[0].name == "Treadmill"

    def test_empty_when_no_expiring(self):
        mock_db = AsyncMock()
        service = MaintenanceAlertService(mock_db)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=mock_result)

        assets = _run(service.get_warranty_expiring(uuid4()))
        assert assets == []


class TestWarrantyExpired:
    """get_warranty_expired returns assets past warranty date."""

    def test_returns_expired_assets(self):
        mock_db = AsyncMock()
        service = MaintenanceAlertService(mock_db)

        asset1 = MagicMock()
        asset1.name = "Old Bike"
        asset1.warranty_expiry = date(2025, 1, 1)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [asset1]
        mock_db.execute = AsyncMock(return_value=mock_result)

        assets = _run(service.get_warranty_expired(uuid4()))
        assert len(assets) == 1


class TestAlertsSummary:
    """get_alerts_summary aggregates all alert types."""

    def test_returns_summary_dict(self):
        mock_db = AsyncMock()
        service = MaintenanceAlertService(mock_db)
        service.maintenance_repo = AsyncMock()
        service.maintenance_repo.count_overdue = AsyncMock(return_value=3)
        service.maintenance_repo.count_upcoming = AsyncMock(return_value=5)

        # Mock get_warranty_expiring
        asset = MagicMock()
        asset.id = uuid4()
        asset.name = "Treadmill X1"
        asset.asset_code = "TRD-001"
        asset.warranty_expiry = date(2026, 6, 1)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [asset]
        mock_db.execute = AsyncMock(return_value=mock_result)

        gym_id = uuid4()
        summary = _run(service.get_alerts_summary(gym_id))

        assert summary["overdue_maintenance_count"] == 3
        assert summary["upcoming_maintenance_count"] == 5
        assert summary["warranty_expiring_count"] == 1
        assert len(summary["warranty_expiring_assets"]) == 1
        assert summary["warranty_expiring_assets"][0]["name"] == "Treadmill X1"
