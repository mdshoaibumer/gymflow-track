from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.asset import AssetCategory, AssetStatus, MaintenanceType


# === Asset Schemas ===


class CreateAssetRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    asset_code: str = Field(..., min_length=1, max_length=50)
    category: AssetCategory
    manufacturer: str | None = None
    serial_number: str | None = None
    purchase_date: date | None = None
    purchase_cost_in_paise: int | None = Field(None, ge=0)
    warranty_expiry: date | None = None
    notes: str | None = None


class UpdateAssetRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    asset_code: str | None = Field(None, min_length=1, max_length=50)
    category: AssetCategory | None = None
    manufacturer: str | None = None
    serial_number: str | None = None
    purchase_date: date | None = None
    purchase_cost_in_paise: int | None = Field(None, ge=0)
    warranty_expiry: date | None = None
    notes: str | None = None


class UpdateAssetStatusRequest(BaseModel):
    status: AssetStatus


class AssetResponse(BaseModel):
    id: UUID
    gym_id: UUID
    name: str
    asset_code: str
    category: AssetCategory
    manufacturer: str | None
    serial_number: str | None
    purchase_date: date | None
    purchase_cost_in_paise: int | None
    warranty_expiry: date | None
    notes: str | None
    status: AssetStatus

    model_config = {"from_attributes": True}


class AssetListResponse(BaseModel):
    assets: list[AssetResponse]
    total: int


# === Maintenance Schemas ===


class CreateMaintenanceRequest(BaseModel):
    maintenance_type: MaintenanceType
    service_date: date
    next_service_date: date | None = None
    cost_in_paise: int = Field(0, ge=0)
    vendor_name: str | None = None
    notes: str | None = None


class MaintenanceResponse(BaseModel):
    id: UUID
    gym_id: UUID
    asset_id: UUID
    maintenance_type: MaintenanceType
    service_date: date
    next_service_date: date | None
    cost_in_paise: int
    vendor_name: str | None
    notes: str | None
    performed_by: UUID | None

    model_config = {"from_attributes": True}


class MaintenanceListResponse(BaseModel):
    records: list[MaintenanceResponse]
    total: int


# === Dashboard Schemas ===


class AssetDashboardStats(BaseModel):
    active_count: int
    under_maintenance_count: int
    out_of_service_count: int
    retired_count: int
    total_count: int
    upcoming_maintenance: int
    overdue_maintenance: int
    maintenance_cost_this_month_paise: int
