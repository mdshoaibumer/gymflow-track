"""
Biometric attendance API routes — device management, enrollment, check-in.

Endpoint Design:
  Admin routes (require auth + admin role):
    - POST   /devices              — Register a new biometric device
    - GET    /devices              — List gym's devices
    - PATCH  /devices/{id}         — Update device settings
    - POST   /devices/{id}/rotate-key — Regenerate device API key
    - GET    /members/{id}/templates  — View member's enrolled templates
    - DELETE /templates/{id}       — Deactivate a template

  Device routes (require X-Device-Key header):
    - POST   /device/check-in     — Record biometric check-in
    - POST   /device/enroll       — Enroll a member's biometric
    - POST   /device/heartbeat    — Device health ping
    - GET    /device/sync-templates — Download templates for local matching

RBAC:
  - Admin routes use standard JWT auth (ADMIN+ role)
  - Device routes use X-Device-Key header (separate auth path)
"""

import logging
from datetime import datetime, timezone
from hashlib import sha256
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_admin
from app.models.biometric import BiometricDevice
from app.schemas.biometric import (
    BiometricCheckInRequest,
    BiometricCheckInResponse,
    DeviceHeartbeatRequest,
    DeviceHeartbeatResponse,
    DeviceListResponse,
    DeviceRegisteredResponse,
    DeviceResponse,
    EnrollTemplateRequest,
    RegisterDeviceRequest,
    TemplateSyncItem,
    TemplateSyncResponse,
    TemplateListResponse,
    TemplateResponse,
    UpdateDeviceRequest,
)
from app.services.biometric_service import BiometricService

logger = logging.getLogger("gymflow.biometric")

router = APIRouter()


# ─── Device Authentication Dependency ────────────────────────────────────────


async def get_authenticated_device(
    x_device_key: str = Header(..., alias="X-Device-Key"),
    db: AsyncSession = Depends(get_db),
) -> BiometricDevice:
    """
    Authenticate a biometric device via X-Device-Key header.

    This is separate from user JWT auth — devices use their own API keys.
    """
    service = BiometricService(db)
    device = await service.authenticate_device(x_device_key)

    if not device:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked device API key",
            headers={"WWW-Authenticate": "X-Device-Key"},
        )

    return device


# ─── Admin Routes (JWT Auth) ─────────────────────────────────────────────────


@router.post(
    "/devices",
    response_model=DeviceRegisteredResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def register_device(
    request: RegisterDeviceRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new biometric device for the gym.

    Returns the API key ONCE — admin must store it securely on the device.
    The key cannot be retrieved again (only rotated).
    """
    service = BiometricService(db)
    device, plain_key = await service.register_device(
        gym_id=current_user.gym_id,
        device_name=request.device_name,
        biometric_type=request.biometric_type,
        device_model=request.device_model,
        serial_number=request.serial_number,
        location=request.location,
        min_match_score=request.min_match_score,
    )
    await db.commit()

    return DeviceRegisteredResponse(
        device=_device_to_response(device),
        api_key=plain_key,
    )


@router.get(
    "/devices",
    response_model=DeviceListResponse,
    dependencies=[Depends(require_admin)],
)
async def list_devices(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all biometric devices registered to this gym."""
    service = BiometricService(db)
    devices = await service.list_devices(current_user.gym_id)
    return DeviceListResponse(
        devices=[_device_to_response(d) for d in devices],
        total=len(devices),
    )


@router.patch(
    "/devices/{device_id}",
    response_model=DeviceResponse,
    dependencies=[Depends(require_admin)],
)
async def update_device(
    device_id: UUID,
    request: UpdateDeviceRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update device name, location, match threshold, or status."""
    service = BiometricService(db)
    device = await service.update_device(
        device_id=device_id,
        gym_id=current_user.gym_id,
        device_name=request.device_name,
        location=request.location,
        min_match_score=request.min_match_score,
        status=request.status,
    )
    await db.commit()
    return _device_to_response(device)


@router.post(
    "/devices/{device_id}/rotate-key",
    response_model=DeviceRegisteredResponse,
    dependencies=[Depends(require_admin)],
)
async def rotate_device_key(
    device_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Regenerate the API key for a device.

    The old key is immediately invalidated. The new key is shown ONCE.
    """
    service = BiometricService(db)
    device, plain_key = await service.rotate_device_key(device_id, current_user.gym_id)
    await db.commit()

    return DeviceRegisteredResponse(
        device=_device_to_response(device),
        api_key=plain_key,
    )


@router.get(
    "/members/{member_id}/templates",
    response_model=TemplateListResponse,
    dependencies=[Depends(require_admin)],
)
async def list_member_templates(
    member_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all biometric templates enrolled for a member."""
    service = BiometricService(db)
    templates = await service.list_templates(
        gym_id=current_user.gym_id,
        member_id=member_id,
        active_only=False,
    )
    return TemplateListResponse(
        templates=[_template_to_response(t) for t in templates],
        total=len(templates),
    )


@router.delete(
    "/templates/{template_id}",
    response_model=TemplateResponse,
    dependencies=[Depends(require_admin)],
)
async def deactivate_template(
    template_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a biometric template (soft delete)."""
    service = BiometricService(db)
    template = await service.deactivate_template(template_id, current_user.gym_id)
    await db.commit()
    return _template_to_response(template)


# ─── Device Routes (X-Device-Key Auth) ───────────────────────────────────────


@router.post(
    "/device/check-in",
    response_model=BiometricCheckInResponse,
)
async def biometric_check_in(
    request: BiometricCheckInRequest,
    device: BiometricDevice = Depends(get_authenticated_device),
    db: AsyncSession = Depends(get_db),
):
    """
    Record a biometric check-in from a device.

    The device has already performed 1:N matching locally. It sends us:
    - member_id: Who was matched
    - match_score: Confidence score from the device SDK
    - template_id: (optional) Which template matched, for audit

    Server-side enforcement:
    - match_score must exceed device's min_match_score threshold
    - Member must have an active template in this gym
    - Standard attendance rules apply (active membership, no duplicates)
    """
    service = BiometricService(db)
    result = await service.biometric_check_in(
        device=device,
        member_id=request.member_id,
        match_score=request.match_score,
        template_id=request.template_id,
    )
    await db.commit()

    return BiometricCheckInResponse(
        attendance_id=result["attendance_id"],
        member_id=result["member_id"],
        member_name=result["member_name"],
        check_in_at=result["check_in_at"],
        status=result["status"],
        message=f"Welcome, {result['member_name']}!",
    )


@router.post(
    "/device/enroll",
    response_model=TemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def device_enroll_template(
    request: EnrollTemplateRequest,
    device: BiometricDevice = Depends(get_authenticated_device),
    db: AsyncSession = Depends(get_db),
):
    """
    Enroll a biometric template from the device.

    Called when a member places their finger/face on the device during
    enrollment. The device captures the template and sends it here for
    encrypted storage.
    """
    service = BiometricService(db)
    template = await service.enroll_template(
        gym_id=device.gym_id,
        member_id=request.member_id,
        device_id=device.id,
        template_data_b64=request.template_data_b64,
        biometric_type=request.biometric_type,
        quality_score=request.quality_score,
        template_format=request.template_format,
    )
    await db.commit()
    return _template_to_response(template)


@router.post(
    "/device/heartbeat",
    response_model=DeviceHeartbeatResponse,
)
async def device_heartbeat(
    request: DeviceHeartbeatRequest,
    device: BiometricDevice = Depends(get_authenticated_device),
    db: AsyncSession = Depends(get_db),
):
    """Periodic health check from device. Updates last_heartbeat_at."""
    service = BiometricService(db)
    await service.record_heartbeat(device)
    await db.commit()

    return DeviceHeartbeatResponse(
        acknowledged=True,
        server_time=datetime.now(timezone.utc),
    )


@router.get(
    "/device/sync-templates",
    response_model=TemplateSyncResponse,
)
async def device_sync_templates(
    device: BiometricDevice = Depends(get_authenticated_device),
    db: AsyncSession = Depends(get_db),
):
    """
    Download active templates for device-side matching.

    The device calls this periodically to sync its local template store.
    Returns decrypted templates — transport security relies on HTTPS.

    NOTE: In production, implement incremental sync with a sync_token
    to avoid re-downloading all templates on every call.
    """
    service = BiometricService(db)
    sync_items = await service.get_templates_for_sync(
        gym_id=device.gym_id,
        biometric_type=device.biometric_type.value,
    )

    # Generate a simple sync token (timestamp-based for now)
    sync_token = sha256(
        f"{device.gym_id}:{datetime.now(timezone.utc).isoformat()}".encode()
    ).hexdigest()[:16]

    return TemplateSyncResponse(
        templates=[
            TemplateSyncItem(
                template_id=item["template_id"],
                member_id=item["member_id"],
                template_data_b64=item["template_data_b64"],
                biometric_type=item["biometric_type"],
                template_format=item["template_format"],
            )
            for item in sync_items
        ],
        total=len(sync_items),
        sync_token=sync_token,
    )


# ─── Response Converters ─────────────────────────────────────────────────────


def _device_to_response(device: BiometricDevice) -> DeviceResponse:
    return DeviceResponse(
        id=device.id,
        gym_id=device.gym_id,
        device_name=device.device_name,
        device_model=device.device_model,
        serial_number=device.serial_number,
        location=device.location,
        biometric_type=device.biometric_type.value,
        status=device.status.value,
        min_match_score=device.min_match_score,
        last_heartbeat_at=device.last_heartbeat_at,
        api_key_prefix=device.api_key_prefix,
        created_at=device.created_at,
    )


def _template_to_response(template) -> TemplateResponse:
    return TemplateResponse(
        id=template.id,
        gym_id=template.gym_id,
        member_id=template.member_id,
        device_id=template.device_id,
        biometric_type=template.biometric_type.value,
        quality_score=template.quality_score,
        template_format=template.template_format,
        is_active=template.is_active,
        enrolled_at=template.enrolled_at,
        created_at=template.created_at,
    )
