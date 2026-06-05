"""
Biometric device and template models for biometric attendance integration.

Architecture Decision — Device-Side Matching:
  Biometric templates are stored encrypted and are NEVER returned via API.
  The matching (1:N) happens on the biometric device itself. The device sends
  only the matched member_id + confidence score to our API. This ensures:
  - GDPR/privacy compliance (biometric data stays on-premise)
  - Lower API latency (no template transfer over network)
  - Offline resilience (device can match without API connectivity)

Device Registration Flow:
  1. Admin registers a biometric device → gets an API key
  2. Device syncs member templates from API (encrypted, one-time download)
  3. On each scan, device matches locally → POSTs member_id to API
  4. API validates device ownership, checks membership, creates attendance

Security Considerations:
  - Device API keys are hashed (bcrypt) in the database — plain key shown ONCE at creation
  - Template data is AES-256-GCM encrypted at rest (encryption key in env, NOT in DB)
  - Cross-gym device misuse prevented: device.gym_id must match request context
  - Match score threshold enforced server-side (prevents spoofed low-confidence matches)
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    LargeBinary,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, PgEnum


class BiometricType(str, PyEnum):
    """Supported biometric modalities."""
    FINGERPRINT = "fingerprint"
    FACE = "face"


class DeviceStatus(str, PyEnum):
    """Lifecycle status of a biometric device."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    REVOKED = "revoked"


class BiometricDevice(BaseModel):
    """
    Represents a physical biometric device registered to a gym.

    Each device has a unique API key for authentication.
    A gym can have multiple devices (e.g., one per entrance).
    """
    __tablename__ = "biometric_devices"
    __table_args__ = (
        Index(
            "ix_biometric_devices_gym_status",
            "gym_id", "status",
            postgresql_using="btree",
        ),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False
    )

    # Device identification
    device_name: Mapped[str] = mapped_column(String(100), nullable=False)
    device_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Authentication — hashed API key (bcrypt)
    api_key_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    # Prefix for identification (first 8 chars of key, shown in UI)
    api_key_prefix: Mapped[str] = mapped_column(String(12), nullable=False)

    # Device capabilities
    biometric_type: Mapped[BiometricType] = mapped_column(
        PgEnum(BiometricType, name="biometrictype"), nullable=False
    )

    # Operational state
    status: Mapped[DeviceStatus] = mapped_column(
        PgEnum(DeviceStatus, name="devicestatus"),
        default=DeviceStatus.ACTIVE,
        nullable=False,
    )
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Matching configuration (server-side enforcement)
    min_match_score: Mapped[float] = mapped_column(
        Float, default=0.80, nullable=False
    )

    # Relationships
    gym = relationship("Gym", lazy="raise")
    templates = relationship("BiometricTemplate", back_populates="device", lazy="raise")


class BiometricTemplate(BaseModel):
    """
    Encrypted biometric template for a member, enrolled via a specific device.

    Templates are encrypted with AES-256-GCM before storage. The encryption
    key is held in BIOMETRIC_ENCRYPTION_KEY env var (never committed to code).

    A member can have multiple templates (e.g., multiple fingers, re-enrollments).
    Only active templates are synced to devices.
    """
    __tablename__ = "biometric_templates"
    __table_args__ = (
        Index(
            "ix_biometric_templates_member_active",
            "member_id", "is_active",
            postgresql_using="btree",
        ),
        Index(
            "ix_biometric_templates_gym_type",
            "gym_id", "biometric_type",
            postgresql_using="btree",
        ),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("biometric_devices.id", ondelete="SET NULL"), nullable=True
    )

    # Encrypted template data (AES-256-GCM)
    template_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    # Initialization vector for decryption
    encryption_iv: Mapped[bytes] = mapped_column(LargeBinary(16), nullable=False)

    biometric_type: Mapped[BiometricType] = mapped_column(
        PgEnum(BiometricType, name="biometrictype"), nullable=False
    )

    # Template metadata
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    template_format: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Lifecycle
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    member = relationship("Member", lazy="raise")
    gym = relationship("Gym", lazy="raise")
    device = relationship("BiometricDevice", back_populates="templates", lazy="raise")
