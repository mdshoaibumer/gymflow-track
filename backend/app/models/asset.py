"""
Asset and Maintenance models for gym equipment tracking.

Relational Reasoning:
- Asset belongs to a Gym (tenant-safe via gym_id FK)
- MaintenanceRecord belongs to both Asset and Gym (dual FK for query efficiency)
- gym_id on MaintenanceRecord is denormalized from Asset — avoids a JOIN when
  listing "all maintenance for this gym" (the most common dashboard query)

Maintenance Tracking Strategy:
- Each service event is a separate MaintenanceRecord (append-only history)
- next_service_date on the record enables "upcoming maintenance" queries
- Asset.status tracks current operational state, NOT maintenance history
- Cost is stored in paise (integer) for exact arithmetic — no float rounding

Operational Scaling:
- Indexes on (gym_id) for tenant-scoped listing
- Index on (asset_id, service_date DESC) for per-equipment history
- Index on (gym_id, next_service_date) for upcoming/overdue maintenance dashboard
- Small gyms have 20-100 assets — these indexes are efficient at any realistic scale
"""

import uuid
from datetime import date
from enum import Enum as PyEnum

from sqlalchemy import (
    Date,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


# === Asset Enums ===


class AssetStatus(str, PyEnum):
    ACTIVE = "active"
    UNDER_MAINTENANCE = "under_maintenance"
    OUT_OF_SERVICE = "out_of_service"
    RETIRED = "retired"


class AssetCategory(str, PyEnum):
    CARDIO = "cardio"
    STRENGTH = "strength"
    FREE_WEIGHTS = "free_weights"
    FUNCTIONAL = "functional"
    ACCESSORIES = "accessories"
    FACILITY = "facility"
    OTHER = "other"


class MaintenanceType(str, PyEnum):
    PREVENTIVE = "preventive"       # Scheduled servicing
    CORRECTIVE = "corrective"       # Breakdown repair
    INSPECTION = "inspection"       # Routine check
    WARRANTY_SERVICE = "warranty"   # Under-warranty repair


# === Asset Model ===


class Asset(BaseModel):
    __tablename__ = "assets"
    __table_args__ = (
        UniqueConstraint("gym_id", "asset_code", name="uq_assets_gym_code"),
        Index("ix_assets_gym_status", "gym_id", "status"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Identity
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    asset_code: Mapped[str] = mapped_column(String(50), nullable=False)
    category: Mapped[AssetCategory] = mapped_column(
        Enum(AssetCategory), nullable=False,
    )

    # Details
    manufacturer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(200), nullable=True)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    purchase_cost_in_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    warranty_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Lifecycle
    status: Mapped[AssetStatus] = mapped_column(
        Enum(AssetStatus), default=AssetStatus.ACTIVE, nullable=False,
    )

    # Relationships
    gym = relationship("Gym", lazy="raise")
    maintenance_records = relationship(
        "MaintenanceRecord", back_populates="asset", lazy="raise",
    )


# === Maintenance Record Model ===


class MaintenanceRecord(BaseModel):
    __tablename__ = "maintenance_records"
    __table_args__ = (
        # Per-asset history: "show me all services for this treadmill"
        Index("ix_maintenance_asset_date", "asset_id", "service_date"),
        # Dashboard query: "upcoming maintenance for this gym"
        Index("ix_maintenance_gym_next", "gym_id", "next_service_date"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Service details
    maintenance_type: Mapped[MaintenanceType] = mapped_column(
        Enum(MaintenanceType), nullable=False,
    )
    service_date: Mapped[date] = mapped_column(Date, nullable=False)
    next_service_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cost_in_paise: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    vendor_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Who recorded this
    performed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    asset = relationship("Asset", back_populates="maintenance_records", lazy="raise")
    gym = relationship("Gym", lazy="raise")
