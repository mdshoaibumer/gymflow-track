"""Member management service — CRUD and lifecycle operations for gym members."""

import logging
import os
from datetime import date
from pathlib import Path
from uuid import UUID

from fastapi import UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AlreadyExistsError, ConflictError, NotFoundError, ValidationError
from app.models.member import Member, MembershipStatus
from app.models.gym_audit_log import GymAuditLog, GymAuditAction
from app.repositories.member_repository import MemberRepository
from app.schemas.member import MemberCreateRequest, MemberListResponse, MemberUpdateRequest, MembershipOverrideRequest

logger = logging.getLogger("gymflow.members")

# Fields that must NOT be set via generic update — they have dedicated lifecycle APIs.
# membership_start/end/plan drive status computation and must go through renewal flow.
_PROTECTED_FIELDS = frozenset({"membership_status", "membership_start", "membership_end", "membership_plan"})

# Allowed photo MIME types and their magic byte signatures.
# Validated against actual file bytes (not the user-supplied Content-Type header).
_ALLOWED_PHOTO_TYPES: dict[str, list[bytes]] = {
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".webp": [b"RIFF"],  # WebP starts with RIFF....WEBP (verified at offset 8)
}

_ALLOWED_EXTENSIONS = set(_ALLOWED_PHOTO_TYPES.keys())


def _is_valid_webp(content: bytes) -> bool:
    """Validate WebP file by checking both RIFF header and WEBP signature at offset 8."""
    return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"


class MemberService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.member_repo = MemberRepository(db)

    async def create_member(self, gym_id: UUID, data: MemberCreateRequest) -> Member:
        # Check for duplicate phone within same gym
        existing = await self.member_repo.get_by_phone_and_gym(data.phone, gym_id)
        if existing:
            raise AlreadyExistsError("Member with this phone number already exists")

        member = Member(gym_id=gym_id, **data.model_dump())
        try:
            return await self.member_repo.create(member)
        except IntegrityError as e:
            # Partial unique index (gym_id, phone) WHERE is_deleted = false
            # can fire on concurrent duplicate phone creation — translate to domain error.
            constraint = getattr(e.orig, "constraint_name", "") or str(e.orig)
            if "phone" in constraint or "uq_members_gym_phone" in constraint:
                raise AlreadyExistsError("Member with this phone number already exists")
            raise

    async def get_member(self, member_id: UUID, gym_id: UUID) -> Member:
        member = await self.member_repo.get_by_id(member_id, gym_id)
        if not member:
            raise NotFoundError("Member not found")
        return member

    async def list_members(
        self, gym_id: UUID, skip: int = 0, limit: int = 50, search: str | None = None
    ) -> MemberListResponse:
        members = await self.member_repo.list_by_gym(gym_id, skip, limit, search)
        total = await self.member_repo.count_by_gym(gym_id, search)
        return MemberListResponse(members=members, total=total)

    async def update_member(
        self, member_id: UUID, gym_id: UUID, data: MemberUpdateRequest
    ) -> Member:
        member = await self.get_member(member_id, gym_id)

        update_data = data.model_dump(exclude_unset=True)

        # Optimistic locking: reject stale updates to prevent silent data loss.
        # The client includes the `version` it read; if the DB version differs,
        # another concurrent edit landed first → return 409 Conflict.
        client_version = update_data.pop("version", None)
        if client_version is not None and client_version != member.version:
            raise ConflictError(
                "This member was modified by another user. "
                "Please refresh and try again."
            )

        # Block direct manipulation of protected lifecycle fields if they are actually changing
        for field_name in _PROTECTED_FIELDS:
            if field_name in update_data:
                current_val = getattr(member, field_name)
                new_val = update_data[field_name]
                
                # Robust comparison: convert both to string if they are dates/datetimes
                # to avoid type-mismatch false positives.
                if str(current_val) != str(new_val):
                    logger.warning(
                        "Attempted protected field change: field=%s current=%s new=%s member_id=%s",
                        field_name, current_val, new_val, member_id
                    )
                    raise ValidationError(
                        f"{field_name} cannot be changed directly. Use the membership management API."
                    )

        # If phone is being changed, check for duplicates
        if "phone" in update_data and update_data["phone"] != member.phone:
            existing = await self.member_repo.get_by_phone_and_gym(
                update_data["phone"], gym_id
            )
            if existing:
                raise AlreadyExistsError("Another member already has this phone number")

        for field, value in update_data.items():
            setattr(member, field, value)

        # Bump version so the next concurrent edit will detect the conflict
        member.version = (member.version or 0) + 1

        try:
            return await self.member_repo.update(member)
        except IntegrityError as e:
            constraint = getattr(e.orig, "constraint_name", "") or str(e.orig)
            if "phone" in constraint or "uq_members_gym_phone" in constraint:
                raise AlreadyExistsError("Another member already has this phone number")
            raise

    async def delete_member(self, member_id: UUID, gym_id: UUID) -> None:
        member = await self.get_member(member_id, gym_id)
        member.is_deleted = True
        await self.member_repo.update(member)

    async def override_membership(
        self, member_id: UUID, gym_id: UUID, user_id: UUID, data: MembershipOverrideRequest
    ) -> Member:
        """
        Admin-only override of protected membership fields.

        Validates date ranges and creates full audit trail.
        Automatically computes membership_status if not explicitly provided.
        """
        member = await self.get_member(member_id, gym_id)

        update_data = data.model_dump(exclude_unset=True)

        # Optimistic locking
        client_version = update_data.pop("version", None)
        if client_version is not None and client_version != member.version:
            raise ConflictError(
                "This member was modified by another user. "
                "Please refresh and try again."
            )

        if not update_data:
            raise ValidationError("No fields provided for override")

        # Validate date range if both dates are being set
        new_start = update_data.get("membership_start", member.membership_start)
        new_end = update_data.get("membership_end", member.membership_end)
        if new_start and new_end and new_start > new_end:
            raise ValidationError("Membership start date cannot be after end date")

        # Capture old values for audit
        old_data = {}
        for field in ("membership_plan", "membership_start", "membership_end", "membership_status"):
            if field in update_data:
                val = getattr(member, field)
                old_data[field] = val.value if isinstance(val, MembershipStatus) else str(val) if val else None

        # Apply the override
        for field, value in update_data.items():
            setattr(member, field, value)

        # Auto-compute status if not explicitly set
        if "membership_status" not in update_data:
            effective_end = member.membership_end
            if member.membership_status not in (MembershipStatus.FROZEN, MembershipStatus.CANCELLED):
                if effective_end is None:
                    member.membership_status = MembershipStatus.PENDING
                elif effective_end >= date.today():
                    member.membership_status = MembershipStatus.ACTIVE
                else:
                    member.membership_status = MembershipStatus.EXPIRED

        # Bump version
        member.version = (member.version or 0) + 1

        # Build new_data for audit
        new_data = {}
        for field in ("membership_plan", "membership_start", "membership_end", "membership_status"):
            if field in update_data or field == "membership_status":
                val = getattr(member, field)
                new_data[field] = val.value if isinstance(val, MembershipStatus) else str(val) if val else None

        # Create audit log entry
        audit_entry = GymAuditLog(
            gym_id=gym_id,
            entity_type="member",
            entity_id=member_id,
            action=GymAuditAction.MEMBERSHIP_OVERRIDE,
            old_data=old_data,
            new_data=new_data,
            description="Membership override applied to member",
            performed_by=user_id,
        )
        self.db.add(audit_entry)

        return await self.member_repo.update(member)

    async def upload_photo(self, member_id: UUID, gym_id: UUID, file: UploadFile) -> Member:
        """Upload or replace a member's photo.

        Security:
        - File type validated by magic bytes (not Content-Type header)
        - File size enforced before writing to disk
        - Filename is UUID-based (no user input in path)
        - Stored under gym_id subdirectory for tenant isolation
        """
        member = await self.get_member(member_id, gym_id)

        # Validate file extension
        _, ext = os.path.splitext(file.filename or "")
        ext = ext.lower()
        if ext not in _ALLOWED_EXTENSIONS:
            raise ValidationError(
                f"Invalid file type. Allowed: {', '.join(sorted(_ALLOWED_EXTENSIONS))}"
            )

        # Read file content with size limit
        max_bytes = settings.MAX_PHOTO_SIZE_MB * 1024 * 1024
        content = await file.read()
        if len(content) > max_bytes:
            raise ValidationError(f"Photo must be under {settings.MAX_PHOTO_SIZE_MB}MB")

        # Validate magic bytes (prevents disguised files)
        valid_magic = False
        detected_ext = ext
        for check_ext, magic_bytes_list in _ALLOWED_PHOTO_TYPES.items():
            if check_ext == ".webp":
                # WebP requires RIFF header + "WEBP" at offset 8
                if _is_valid_webp(content):
                    valid_magic = True
                    detected_ext = ".webp"
                    break
            else:
                for magic in magic_bytes_list:
                    if content[:len(magic)] == magic:
                        valid_magic = True
                        detected_ext = check_ext
                        break
            if valid_magic:
                break

        if not valid_magic:
            raise ValidationError("File content does not match a supported image format")

        # Build path: uploads/members/{gym_id}/{member_id}.jpg
        upload_dir = Path(settings.UPLOAD_DIR) / "members" / str(gym_id)
        upload_dir.mkdir(parents=True, exist_ok=True)

        # Remove any existing photo with different extension
        for old_ext in _ALLOWED_EXTENSIONS:
            old_file = upload_dir / f"{member_id}{old_ext}"
            if old_file.exists():
                old_file.unlink()

        # Write file
        file_path = upload_dir / f"{member_id}{detected_ext}"
        file_path.write_bytes(content)

        # Update DB with relative URL
        relative_url = f"/uploads/members/{gym_id}/{member_id}{detected_ext}"
        member.photo_url = relative_url
        member.version = (member.version or 0) + 1
        await self.member_repo.update(member)

        logger.info("photo_uploaded member_id=%s gym_id=%s size=%d", member_id, gym_id, len(content))
        return member

    async def delete_photo(self, member_id: UUID, gym_id: UUID) -> Member:
        """Remove a member's photo from disk and DB."""
        member = await self.get_member(member_id, gym_id)

        if not member.photo_url:
            raise NotFoundError("Member has no photo")

        # Delete file from disk
        # photo_url is like "/uploads/members/{gym_id}/{member_id}.jpg"
        # Strip leading "/uploads/" to get relative path under UPLOAD_DIR
        relative_path = member.photo_url.removeprefix("/uploads/")
        file_path = Path(settings.UPLOAD_DIR) / relative_path
        if file_path.exists():
            file_path.unlink()

        member.photo_url = None
        member.version = (member.version or 0) + 1
        await self.member_repo.update(member)

        logger.info("photo_deleted member_id=%s gym_id=%s", member_id, gym_id)
        return member
