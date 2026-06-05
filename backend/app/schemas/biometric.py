"""
Biometric attendance schemas — request/response DTOs.

Follows the same patterns as other GymFlow schemas:
- Pydantic v2 with model_config = {"from_attributes": True}
- Separate Request and Response models
- UUIDs for all IDs
- Minimal exposure of sensitive data (no template_data in responses)
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# === Device Registration ===


class RegisterDeviceRequest(BaseModel):
    """Admin registers a new biometric device for their gym."""
    device_name: str = Field(..., min_length=1, max_length=100)
    device_model: str | None = Field(None, max_length=100)
    serial_number: str | None = Field(None, max_length=100)
    location: str | None = Field(None, max_length=200, description="e.g., 'Main Entrance', 'Back Door'")
    biometric_type: str = Field(..., description="fingerprint or face")
    min_match_score: float = Field(0.80, ge=0.50, le=1.0, description="Minimum confidence threshold")


class DeviceResponse(BaseModel):
    """Public device info (never includes API key hash)."""
    id: UUID
    gym_id: UUID
    device_name: str
    device_model: str | None
    serial_number: str | None
    location: str | None
    biometric_type: str
    status: str
    min_match_score: float
    last_heartbeat_at: datetime | None
    api_key_prefix: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DeviceRegisteredResponse(BaseModel):
    """Returned ONCE at device creation — includes the plain API key."""
    device: DeviceResponse
    api_key: str = Field(..., description="Plain API key — shown ONLY once. Store securely on the device.")


class DeviceListResponse(BaseModel):
    devices: list[DeviceResponse]
    total: int


class UpdateDeviceRequest(BaseModel):
    """Update device metadata (not the API key)."""
    device_name: str | None = Field(None, min_length=1, max_length=100)
    location: str | None = Field(None, max_length=200)
    min_match_score: float | None = Field(None, ge=0.50, le=1.0)
    status: str | None = Field(None, description="active, inactive, or revoked")


# === Template Enrollment ===


class EnrollTemplateRequest(BaseModel):
    """Enroll a biometric template for a member (sent from device)."""
    member_id: UUID
    template_data_b64: str = Field(..., description="Base64-encoded biometric template from device SDK")
    biometric_type: str = Field(..., description="fingerprint or face")
    quality_score: float | None = Field(None, ge=0.0, le=1.0)
    template_format: str | None = Field(None, max_length=50, description="e.g., ISO_19794_2, ANSI_378")


class TemplateResponse(BaseModel):
    """Template metadata (never includes actual template data)."""
    id: UUID
    gym_id: UUID
    member_id: UUID
    device_id: UUID | None
    biometric_type: str
    quality_score: float | None
    template_format: str | None
    is_active: bool
    enrolled_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class TemplateListResponse(BaseModel):
    templates: list[TemplateResponse]
    total: int


# === Biometric Check-In ===


class BiometricCheckInRequest(BaseModel):
    """
    Sent by the biometric device after a successful local match.

    The device performs 1:N matching locally, then sends the result
    to our API for attendance recording.
    """
    member_id: UUID = Field(..., description="Matched member UUID from device-side 1:N matching")
    match_score: float = Field(..., ge=0.0, le=1.0, description="Confidence score from device SDK")
    template_id: UUID | None = Field(None, description="Which template matched (for audit)")


class BiometricCheckInResponse(BaseModel):
    """Response after successful biometric check-in."""
    attendance_id: UUID
    member_id: UUID
    member_name: str
    check_in_at: datetime
    status: str
    message: str = "Check-in successful"


# === Device Heartbeat ===


class DeviceHeartbeatRequest(BaseModel):
    """Periodic health signal from device."""
    enrolled_count: int | None = Field(None, description="Number of templates stored on device")
    firmware_version: str | None = None


class DeviceHeartbeatResponse(BaseModel):
    acknowledged: bool = True
    server_time: datetime


# === Template Sync (Device pulls templates) ===


class TemplateSyncItem(BaseModel):
    """Single template for device sync (includes encrypted data)."""
    template_id: UUID
    member_id: UUID
    template_data_b64: str
    biometric_type: str
    template_format: str | None


class TemplateSyncResponse(BaseModel):
    """Batch of templates for device to download."""
    templates: list[TemplateSyncItem]
    total: int
    sync_token: str = Field(..., description="Opaque token for incremental sync")
