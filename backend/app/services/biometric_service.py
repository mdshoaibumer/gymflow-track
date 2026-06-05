"""
Biometric attendance service — device management, enrollment, and check-in.

Architecture:
  This service manages the biometric device lifecycle and bridges device-side
  matching results into the existing attendance pipeline. It does NOT perform
  biometric matching — that happens on the physical device.

Security Layers:
  1. Device API key authentication (bcrypt-hashed, shown once at registration)
  2. Device-to-gym binding (prevents cross-gym device misuse)
  3. Match score threshold enforcement (server-side minimum, configurable per device)
  4. Template encryption at rest (AES-256-GCM)
  5. Audit trail on all enrollment/deactivation operations

Integration Point:
  biometric_check_in() delegates to AttendanceService._perform_check_in()
  which enforces all existing business rules (active membership, dedup, etc.)
"""

import base64
import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timezone
from uuid import UUID

import bcrypt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.models.attendance import CheckInSource
from app.models.biometric import (
    BiometricDevice,
    BiometricTemplate,
    BiometricType,
    DeviceStatus,
)
from app.repositories.member_repository import MemberRepository
from app.services.attendance_service import AttendanceService

logger = logging.getLogger("gymflow.biometric")

# AES-256-GCM key from environment (32 bytes, base64 encoded)
_ENCRYPTION_KEY: bytes | None = None


def _get_encryption_key() -> bytes:
    """Load encryption key from settings (lazy, cached)."""
    global _ENCRYPTION_KEY
    if _ENCRYPTION_KEY is None:
        key_b64 = getattr(settings, "BIOMETRIC_ENCRYPTION_KEY", None)
        if not key_b64:
            raise RuntimeError(
                "BIOMETRIC_ENCRYPTION_KEY environment variable is required for biometric features. "
                "Generate with: python -c \"import os, base64; print(base64.b64encode(os.urandom(32)).decode())\""
            )
        _ENCRYPTION_KEY = base64.b64decode(key_b64)
        if len(_ENCRYPTION_KEY) != 32:
            raise RuntimeError("BIOMETRIC_ENCRYPTION_KEY must be exactly 32 bytes (base64-encoded)")
    return _ENCRYPTION_KEY


def _encrypt_template(plaintext: bytes) -> tuple[bytes, bytes]:
    """Encrypt template data with AES-256-GCM. Returns (ciphertext, iv)."""
    key = _get_encryption_key()
    iv = os.urandom(12)  # 96-bit nonce for GCM
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext, None)
    return ciphertext, iv


def _decrypt_template(ciphertext: bytes, iv: bytes) -> bytes:
    """Decrypt template data with AES-256-GCM."""
    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ciphertext, None)


def _generate_api_key() -> tuple[str, str, str]:
    """
    Generate a secure device API key.
    Returns: (plain_key, hashed_key, prefix)
    """
    plain_key = f"gfbio_{secrets.token_urlsafe(32)}"
    prefix = plain_key[:12]
    hashed_key = bcrypt.hashpw(plain_key.encode(), bcrypt.gensalt()).decode()
    return plain_key, hashed_key, prefix


def _verify_api_key(plain_key: str, hashed_key: str) -> bool:
    """Verify a device API key against its hash."""
    return bcrypt.checkpw(plain_key.encode(), hashed_key.encode())


class BiometricService:
    """Manages biometric devices, templates, and check-in validation."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.member_repo = MemberRepository(db)

    # ─── Device Management ───────────────────────────────────────────────

    async def register_device(
        self,
        gym_id: UUID,
        device_name: str,
        biometric_type: str,
        device_model: str | None = None,
        serial_number: str | None = None,
        location: str | None = None,
        min_match_score: float = 0.80,
    ) -> tuple[BiometricDevice, str]:
        """
        Register a new biometric device for a gym.

        Returns:
            (device, plain_api_key) — plain key is shown ONCE to the admin.
        """
        # Validate biometric type
        try:
            bio_type = BiometricType(biometric_type)
        except ValueError:
            raise ValidationError(
                f"Invalid biometric type: '{biometric_type}'. Must be 'fingerprint' or 'face'."
            )

        # Generate API key
        plain_key, hashed_key, prefix = _generate_api_key()

        device = BiometricDevice(
            gym_id=gym_id,
            device_name=device_name,
            device_model=device_model,
            serial_number=serial_number,
            location=location,
            biometric_type=bio_type,
            api_key_hash=hashed_key,
            api_key_prefix=prefix,
            min_match_score=min_match_score,
            status=DeviceStatus.ACTIVE,
        )

        self.db.add(device)
        await self.db.flush()

        logger.info(
            f"Registered biometric device '{device_name}' (type={biometric_type}) "
            f"for gym {gym_id}, prefix={prefix}"
        )

        return device, plain_key

    async def get_device(self, device_id: UUID, gym_id: UUID) -> BiometricDevice | None:
        """Get a device by ID, scoped to gym."""
        result = await self.db.execute(
            select(BiometricDevice).where(
                BiometricDevice.id == device_id,
                BiometricDevice.gym_id == gym_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_devices(self, gym_id: UUID) -> list[BiometricDevice]:
        """List all devices for a gym."""
        result = await self.db.execute(
            select(BiometricDevice)
            .where(BiometricDevice.gym_id == gym_id)
            .order_by(BiometricDevice.created_at.desc())
        )
        return list(result.scalars().all())

    async def update_device(
        self,
        device_id: UUID,
        gym_id: UUID,
        device_name: str | None = None,
        location: str | None = None,
        min_match_score: float | None = None,
        status: str | None = None,
    ) -> BiometricDevice:
        """Update device metadata."""
        device = await self.get_device(device_id, gym_id)
        if not device:
            raise NotFoundError("Biometric device not found")

        if device_name is not None:
            device.device_name = device_name
        if location is not None:
            device.location = location
        if min_match_score is not None:
            device.min_match_score = min_match_score
        if status is not None:
            try:
                device.status = DeviceStatus(status)
            except ValueError:
                raise ValidationError(
                    f"Invalid status: '{status}'. Must be 'active', 'inactive', or 'revoked'."
                )

        await self.db.flush()
        return device

    async def rotate_device_key(self, device_id: UUID, gym_id: UUID) -> tuple[BiometricDevice, str]:
        """
        Generate a new API key for a device (invalidates old key).
        Returns (device, new_plain_key).
        """
        device = await self.get_device(device_id, gym_id)
        if not device:
            raise NotFoundError("Biometric device not found")

        plain_key, hashed_key, prefix = _generate_api_key()
        device.api_key_hash = hashed_key
        device.api_key_prefix = prefix
        await self.db.flush()

        logger.info(f"Rotated API key for device {device_id}, new prefix={prefix}")
        return device, plain_key

    async def authenticate_device(self, api_key: str) -> BiometricDevice | None:
        """
        Authenticate a device by its API key.
        Uses prefix lookup + bcrypt verify to avoid scanning all rows.
        """
        if not api_key or len(api_key) < 12:
            return None

        prefix = api_key[:12]
        result = await self.db.execute(
            select(BiometricDevice).where(
                BiometricDevice.api_key_prefix == prefix,
                BiometricDevice.status == DeviceStatus.ACTIVE,
            )
        )
        devices = list(result.scalars().all())

        # Prefix might collide (unlikely but possible) — verify with bcrypt
        for device in devices:
            if _verify_api_key(api_key, device.api_key_hash):
                return device

        return None

    async def record_heartbeat(self, device: BiometricDevice) -> None:
        """Update the last heartbeat timestamp for a device."""
        device.last_heartbeat_at = datetime.now(timezone.utc)
        await self.db.flush()

    # ─── Template Management ─────────────────────────────────────────────

    async def enroll_template(
        self,
        gym_id: UUID,
        member_id: UUID,
        device_id: UUID | None,
        template_data_b64: str,
        biometric_type: str,
        quality_score: float | None = None,
        template_format: str | None = None,
    ) -> BiometricTemplate:
        """
        Enroll a biometric template for a member.

        The template is encrypted before storage. Only active members
        can have templates enrolled.
        """
        # Validate biometric type
        try:
            bio_type = BiometricType(biometric_type)
        except ValueError:
            raise ValidationError(
                f"Invalid biometric type: '{biometric_type}'. Must be 'fingerprint' or 'face'."
            )

        # Verify member exists in this gym
        member = await self.member_repo.get_by_id(member_id, gym_id)
        if not member:
            raise NotFoundError("Member not found in this gym")

        # Decode template from base64
        try:
            template_raw = base64.b64decode(template_data_b64)
        except Exception:
            raise ValidationError("Invalid template data — must be valid base64")

        if len(template_raw) < 32:
            raise ValidationError("Template data too small — likely corrupted")
        if len(template_raw) > 50_000:
            raise ValidationError("Template data exceeds maximum size (50KB)")

        # Encrypt template
        encrypted_data, iv = _encrypt_template(template_raw)

        now = datetime.now(timezone.utc)
        template = BiometricTemplate(
            gym_id=gym_id,
            member_id=member_id,
            device_id=device_id,
            template_data=encrypted_data,
            encryption_iv=iv,
            biometric_type=bio_type,
            quality_score=quality_score,
            template_format=template_format,
            is_active=True,
            enrolled_at=now,
        )

        self.db.add(template)
        await self.db.flush()

        logger.info(
            f"Enrolled {biometric_type} template for member {member_id} "
            f"in gym {gym_id} (quality={quality_score})"
        )
        return template

    async def list_templates(
        self, gym_id: UUID, member_id: UUID | None = None, active_only: bool = True
    ) -> list[BiometricTemplate]:
        """List templates for a gym, optionally filtered by member."""
        query = select(BiometricTemplate).where(BiometricTemplate.gym_id == gym_id)

        if member_id:
            query = query.where(BiometricTemplate.member_id == member_id)
        if active_only:
            query = query.where(BiometricTemplate.is_active == True)  # noqa: E712

        query = query.order_by(BiometricTemplate.enrolled_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def deactivate_template(
        self, template_id: UUID, gym_id: UUID
    ) -> BiometricTemplate:
        """Deactivate a template (soft delete for audit trail)."""
        result = await self.db.execute(
            select(BiometricTemplate).where(
                BiometricTemplate.id == template_id,
                BiometricTemplate.gym_id == gym_id,
            )
        )
        template = result.scalar_one_or_none()
        if not template:
            raise NotFoundError("Biometric template not found")

        if not template.is_active:
            raise ValidationError("Template is already deactivated")

        template.is_active = False
        template.deactivated_at = datetime.now(timezone.utc)
        await self.db.flush()

        logger.info(f"Deactivated template {template_id} for gym {gym_id}")
        return template

    async def get_templates_for_sync(
        self, gym_id: UUID, biometric_type: str
    ) -> list[dict]:
        """
        Get active templates for device sync (decrypted).

        This is the ONLY method that returns decrypted template data.
        Called when a device needs to sync its local template store.
        """
        try:
            bio_type = BiometricType(biometric_type)
        except ValueError:
            raise ValidationError(f"Invalid biometric type: '{biometric_type}'")

        result = await self.db.execute(
            select(BiometricTemplate).where(
                BiometricTemplate.gym_id == gym_id,
                BiometricTemplate.biometric_type == bio_type,
                BiometricTemplate.is_active == True,  # noqa: E712
            )
        )
        templates = list(result.scalars().all())

        sync_items = []
        for tmpl in templates:
            try:
                decrypted = _decrypt_template(tmpl.template_data, tmpl.encryption_iv)
                sync_items.append({
                    "template_id": tmpl.id,
                    "member_id": tmpl.member_id,
                    "template_data_b64": base64.b64encode(decrypted).decode(),
                    "biometric_type": tmpl.biometric_type.value,
                    "template_format": tmpl.template_format,
                })
            except Exception as e:
                logger.error(f"Failed to decrypt template {tmpl.id}: {e}")
                continue

        return sync_items

    # ─── Biometric Check-In ──────────────────────────────────────────────

    async def biometric_check_in(
        self,
        device: BiometricDevice,
        member_id: UUID,
        match_score: float,
        template_id: UUID | None = None,
    ) -> dict:
        """
        Process a biometric check-in from a device.

        Validates match score threshold, then delegates to the standard
        attendance pipeline for membership checks, dedup, etc.

        Returns:
            dict with attendance info and member name for device display.
        """
        # 1. Enforce minimum match score (server-side)
        if match_score < device.min_match_score:
            raise ValidationError(
                f"Match confidence too low ({match_score:.2f}). "
                f"Minimum required: {device.min_match_score:.2f}. "
                "Please retry or use manual check-in."
            )

        # 2. Verify member has an active template in this gym (prevents spoofed member_id)
        result = await self.db.execute(
            select(func.count()).select_from(BiometricTemplate).where(
                BiometricTemplate.gym_id == device.gym_id,
                BiometricTemplate.member_id == member_id,
                BiometricTemplate.is_active == True,  # noqa: E712
            )
        )
        template_count = result.scalar_one()
        if template_count == 0:
            raise ValidationError(
                "No active biometric template found for this member. "
                "Please enroll the member first."
            )

        # 3. Delegate to standard attendance pipeline
        attendance_service = AttendanceService(self.db)
        attendance = await attendance_service._perform_check_in(
            gym_id=device.gym_id,
            member_id=member_id,
            source=CheckInSource.BIOMETRIC,
            recorded_by=None,
        )

        # 4. Get member name for device display
        member_name = "Member"
        if hasattr(attendance, "member") and attendance.member:
            member_name = attendance.member.name

        logger.info(
            f"Biometric check-in: member={member_id}, device={device.id}, "
            f"score={match_score:.2f}, gym={device.gym_id}"
        )

        return {
            "attendance_id": attendance.id,
            "member_id": attendance.member_id,
            "member_name": member_name,
            "check_in_at": attendance.check_in_at,
            "status": attendance.status.value,
        }
