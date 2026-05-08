"""
Tests for Asset + Equipment Maintenance Management.

Coverage:
1. Asset creation — unique code enforcement
2. Lifecycle transitions — valid and invalid state changes
3. Maintenance recording — auto-status transition, cost tracking
4. Overdue detection — past-due next_service_date
5. Tenant isolation — Gym A cannot access Gym B assets
6. RBAC — staff restrictions, delete requires owner
7. Dashboard stats — correct aggregation
"""

from datetime import date, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import (
    Asset,
    AssetCategory,
    AssetStatus,
    MaintenanceRecord,
    MaintenanceType,
)
from app.models.gym import Gym
from app.models.user import User
from app.services.asset_service import AssetService


# === Fixtures ===


@pytest.fixture
async def sample_asset(db_session: AsyncSession, sample_gym: Gym) -> Asset:
    """A basic active treadmill."""
    asset = Asset(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Treadmill #1",
        asset_code="TM-001",
        category=AssetCategory.CARDIO,
        manufacturer="LifeFitness",
        purchase_date=date.today() - timedelta(days=365),
        purchase_cost_in_paise=15000000,  # ₹1,50,000
        warranty_expiry=date.today() + timedelta(days=365),
        status=AssetStatus.ACTIVE,
    )
    db_session.add(asset)
    await db_session.flush()
    return asset


@pytest.fixture
async def maintenance_record_with_next(
    db_session: AsyncSession, sample_gym: Gym, sample_asset: Asset
) -> MaintenanceRecord:
    """A maintenance record with next_service_date in the future."""
    record = MaintenanceRecord(
        id=uuid4(),
        gym_id=sample_gym.id,
        asset_id=sample_asset.id,
        maintenance_type=MaintenanceType.PREVENTIVE,
        service_date=date.today() - timedelta(days=30),
        next_service_date=date.today() + timedelta(days=10),
        cost_in_paise=500000,  # ₹5,000
        vendor_name="FitRepair Co.",
        notes="Routine belt replacement",
    )
    db_session.add(record)
    await db_session.flush()
    return record


@pytest.fixture
async def overdue_maintenance_record(
    db_session: AsyncSession, sample_gym: Gym, sample_asset: Asset
) -> MaintenanceRecord:
    """A maintenance record that is overdue."""
    record = MaintenanceRecord(
        id=uuid4(),
        gym_id=sample_gym.id,
        asset_id=sample_asset.id,
        maintenance_type=MaintenanceType.INSPECTION,
        service_date=date.today() - timedelta(days=90),
        next_service_date=date.today() - timedelta(days=5),
        cost_in_paise=100000,
    )
    db_session.add(record)
    await db_session.flush()
    return record


# === Asset Creation Tests ===


@pytest.mark.asyncio
async def test_create_asset(db_session: AsyncSession, sample_gym: Gym):
    """Creating an asset works with valid data."""
    service = AssetService(db_session)
    asset = await service.create_asset(
        gym_id=sample_gym.id,
        name="Bench Press",
        asset_code="BP-001",
        category=AssetCategory.STRENGTH,
        manufacturer="Hammer Strength",
        purchase_cost_in_paise=8000000,
    )
    assert asset.name == "Bench Press"
    assert asset.status == AssetStatus.ACTIVE
    assert asset.gym_id == sample_gym.id


@pytest.mark.asyncio
async def test_duplicate_asset_code_rejected(
    db_session: AsyncSession, sample_gym: Gym, sample_asset: Asset
):
    """Cannot create two assets with the same code in the same gym."""
    from app.core.exceptions import AlreadyExistsError

    service = AssetService(db_session)
    with pytest.raises(AlreadyExistsError, match="TM-001"):
        await service.create_asset(
            gym_id=sample_gym.id,
            name="Another Treadmill",
            asset_code="TM-001",  # Duplicate
            category=AssetCategory.CARDIO,
        )


# === Lifecycle Transition Tests ===


@pytest.mark.asyncio
async def test_valid_status_transitions(
    db_session: AsyncSession, sample_gym: Gym, sample_asset: Asset
):
    """ACTIVE → UNDER_MAINTENANCE → ACTIVE is a valid lifecycle."""
    service = AssetService(db_session)

    updated = await service.update_status(
        sample_gym.id, sample_asset.id, AssetStatus.UNDER_MAINTENANCE
    )
    assert updated.status == AssetStatus.UNDER_MAINTENANCE

    completed = await service.update_status(
        sample_gym.id, sample_asset.id, AssetStatus.ACTIVE
    )
    assert completed.status == AssetStatus.ACTIVE


@pytest.mark.asyncio
async def test_retired_is_terminal(
    db_session: AsyncSession, sample_gym: Gym, sample_asset: Asset
):
    """RETIRED assets cannot transition to any other status."""
    from app.core.exceptions import ValidationError

    service = AssetService(db_session)
    # First retire it via valid path: ACTIVE → RETIRED
    await service.update_status(
        sample_gym.id, sample_asset.id, AssetStatus.RETIRED
    )

    with pytest.raises(ValidationError, match="Cannot transition"):
        await service.update_status(
            sample_gym.id, sample_asset.id, AssetStatus.ACTIVE
        )


@pytest.mark.asyncio
async def test_out_of_service_cannot_go_directly_to_active(
    db_session: AsyncSession, sample_gym: Gym, sample_asset: Asset
):
    """OUT_OF_SERVICE → ACTIVE is invalid (must go through UNDER_MAINTENANCE)."""
    from app.core.exceptions import ValidationError

    service = AssetService(db_session)
    await service.update_status(
        sample_gym.id, sample_asset.id, AssetStatus.OUT_OF_SERVICE
    )

    with pytest.raises(ValidationError, match="Cannot transition"):
        await service.update_status(
            sample_gym.id, sample_asset.id, AssetStatus.ACTIVE
        )


@pytest.mark.asyncio
async def test_delete_requires_retired(
    db_session: AsyncSession, sample_gym: Gym, sample_asset: Asset
):
    """Only RETIRED assets can be deleted."""
    from app.core.exceptions import ValidationError

    service = AssetService(db_session)
    with pytest.raises(ValidationError, match="Retire"):
        await service.delete_asset(sample_gym.id, sample_asset.id)


# === Maintenance Recording Tests ===


@pytest.mark.asyncio
async def test_record_maintenance_auto_transitions_status(
    db_session: AsyncSession, sample_gym: Gym, sample_asset: Asset, sample_user: User
):
    """Recording maintenance on an ACTIVE asset auto-transitions to UNDER_MAINTENANCE."""
    service = AssetService(db_session)
    assert sample_asset.status == AssetStatus.ACTIVE

    record = await service.record_maintenance(
        gym_id=sample_gym.id,
        asset_id=sample_asset.id,
        maintenance_type=MaintenanceType.CORRECTIVE,
        service_date=date.today(),
        cost_in_paise=200000,
        vendor_name="QuickFix",
        performed_by=sample_user.id,
    )

    assert record.cost_in_paise == 200000
    assert sample_asset.status == AssetStatus.UNDER_MAINTENANCE


@pytest.mark.asyncio
async def test_complete_maintenance_returns_to_active(
    db_session: AsyncSession, sample_gym: Gym, sample_asset: Asset
):
    """Completing maintenance returns asset to ACTIVE."""
    service = AssetService(db_session)

    # Put under maintenance
    await service.update_status(
        sample_gym.id, sample_asset.id, AssetStatus.UNDER_MAINTENANCE
    )

    completed = await service.complete_maintenance(
        sample_gym.id, sample_asset.id
    )
    assert completed.status == AssetStatus.ACTIVE


@pytest.mark.asyncio
async def test_maintenance_on_retired_rejected(
    db_session: AsyncSession, sample_gym: Gym, sample_asset: Asset
):
    """Cannot record maintenance on a retired asset."""
    from app.core.exceptions import ValidationError

    service = AssetService(db_session)
    await service.update_status(
        sample_gym.id, sample_asset.id, AssetStatus.RETIRED
    )

    with pytest.raises(ValidationError, match="retired"):
        await service.record_maintenance(
            gym_id=sample_gym.id,
            asset_id=sample_asset.id,
            maintenance_type=MaintenanceType.PREVENTIVE,
            service_date=date.today(),
        )


@pytest.mark.asyncio
async def test_negative_cost_rejected(
    db_session: AsyncSession, sample_gym: Gym, sample_asset: Asset
):
    """Negative maintenance cost is rejected."""
    from app.core.exceptions import ValidationError

    service = AssetService(db_session)
    with pytest.raises(ValidationError, match="negative"):
        await service.record_maintenance(
            gym_id=sample_gym.id,
            asset_id=sample_asset.id,
            maintenance_type=MaintenanceType.CORRECTIVE,
            service_date=date.today(),
            cost_in_paise=-100,
        )


# === Overdue Detection Tests ===


@pytest.mark.asyncio
async def test_overdue_maintenance_detected(
    db_session: AsyncSession,
    sample_gym: Gym,
    sample_asset: Asset,
    overdue_maintenance_record: MaintenanceRecord,
):
    """Overdue maintenance records are detected correctly."""
    from app.repositories.asset_repository import MaintenanceRepository

    repo = MaintenanceRepository(db_session)
    overdue = await repo.get_overdue(sample_gym.id, date.today())
    assert len(overdue) >= 1
    assert overdue[0].next_service_date < date.today()


@pytest.mark.asyncio
async def test_upcoming_maintenance_detected(
    db_session: AsyncSession,
    sample_gym: Gym,
    sample_asset: Asset,
    maintenance_record_with_next: MaintenanceRecord,
):
    """Upcoming maintenance records are detected correctly."""
    from app.repositories.asset_repository import MaintenanceRepository

    repo = MaintenanceRepository(db_session)
    upcoming = await repo.get_upcoming(sample_gym.id, date.today())
    assert len(upcoming) >= 1


# === Tenant Isolation Tests ===


@pytest.mark.asyncio
async def test_assets_isolated_by_gym(
    db_session: AsyncSession, sample_gym: Gym, other_gym: Gym, sample_asset: Asset
):
    """Assets from one gym are not visible to another gym."""
    from app.repositories.asset_repository import AssetRepository

    repo = AssetRepository(db_session)
    other_assets = await repo.list_by_gym(other_gym.id)
    assert len(other_assets) == 0

    # But sample gym sees it
    sample_assets = await repo.list_by_gym(sample_gym.id)
    assert len(sample_assets) >= 1


@pytest.mark.asyncio
async def test_api_tenant_isolation(
    client: AsyncClient,
    auth_headers: dict,
    other_auth_headers: dict,
    db_session: AsyncSession,
    sample_gym: Gym,
    sample_asset: Asset,
    other_gym,
    other_user,
):
    """GET /assets from other gym returns empty list."""
    await db_session.commit()

    resp = await client.get("/api/v1/assets", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1

    resp2 = await client.get("/api/v1/assets", headers=other_auth_headers)
    assert resp2.status_code == 200
    assert resp2.json()["total"] == 0


# === API Tests ===


@pytest.mark.asyncio
async def test_api_create_asset(
    client: AsyncClient, auth_headers: dict
):
    """POST /assets creates an asset."""
    resp = await client.post(
        "/api/v1/assets",
        json={
            "name": "Leg Press",
            "asset_code": "LP-001",
            "category": "strength",
            "manufacturer": "Technogym",
            "purchase_cost_in_paise": 25000000,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Leg Press"
    assert data["status"] == "active"
    assert data["purchase_cost_in_paise"] == 25000000


@pytest.mark.asyncio
async def test_api_stats(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_asset: Asset,
):
    """GET /assets/stats returns correct aggregation."""
    await db_session.commit()

    resp = await client.get("/api/v1/assets/stats", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["active_count"] >= 1
    assert data["total_count"] >= 1
    assert "maintenance_cost_this_month_paise" in data


@pytest.mark.asyncio
async def test_api_record_maintenance(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_asset: Asset,
):
    """POST /assets/{id}/maintenance records a service event."""
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/assets/{sample_asset.id}/maintenance",
        json={
            "maintenance_type": "corrective",
            "service_date": date.today().isoformat(),
            "cost_in_paise": 300000,
            "vendor_name": "FixIt Services",
            "notes": "Replaced motor belt",
            "next_service_date": (date.today() + timedelta(days=90)).isoformat(),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["cost_in_paise"] == 300000
    assert data["vendor_name"] == "FixIt Services"


@pytest.mark.asyncio
async def test_api_maintenance_history(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_asset: Asset,
    maintenance_record_with_next: MaintenanceRecord,
):
    """GET /assets/{id}/maintenance returns history."""
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/assets/{sample_asset.id}/maintenance",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_api_staff_cannot_create(
    client: AsyncClient, staff_headers: dict, staff_user
):
    """Staff cannot create assets — ADMIN required."""
    resp = await client.post(
        "/api/v1/assets",
        json={
            "name": "Dumbbell Set",
            "asset_code": "DB-001",
            "category": "free_weights",
        },
        headers=staff_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_api_staff_can_read(
    client: AsyncClient,
    staff_headers: dict,
    db_session: AsyncSession,
    sample_asset: Asset,
    staff_user,
):
    """Staff CAN list and view assets."""
    await db_session.commit()

    resp = await client.get("/api/v1/assets", headers=staff_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_api_complete_maintenance(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
    sample_asset: Asset,
):
    """POST /assets/{id}/complete-maintenance returns asset to active."""
    # First put under maintenance
    sample_asset.status = AssetStatus.UNDER_MAINTENANCE
    await db_session.flush()
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/assets/{sample_asset.id}/complete-maintenance",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"
