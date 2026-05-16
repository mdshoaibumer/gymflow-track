"""Gym profile management service — settings and metadata operations."""

import logging
import os
from pathlib import Path
from uuid import UUID

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.models.gym import Gym
from app.repositories.gym_repository import GymRepository
from app.schemas.gym import GymUpdateRequest

logger = logging.getLogger("gymflow.gyms")

_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
_ALLOWED_MAGIC = {
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".webp": [b"RIFF"],
}
_MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2MB


class GymService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.gym_repo = GymRepository(db)

    async def get_gym(self, gym_id: UUID) -> Gym:
        gym = await self.gym_repo.get_by_id(gym_id)
        if not gym:
            raise NotFoundError("Gym not found")
        return gym

    async def update_gym(self, gym_id: UUID, data: GymUpdateRequest) -> Gym:
        gym = await self.get_gym(gym_id)

        allowed_fields = {"name", "phone", "email", "address", "city"}
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field in allowed_fields:
                setattr(gym, field, value)

        await self.db.flush()
        return gym

    async def upload_logo(self, gym_id: UUID, file: UploadFile) -> Gym:
        """Upload or replace the gym logo.

        Security:
        - File type validated by magic bytes
        - File size enforced before writing
        - Filename is gym_id-based (no user input in path)
        """
        gym = await self.get_gym(gym_id)

        # Validate extension
        _, ext = os.path.splitext(file.filename or "")
        ext = ext.lower()
        if ext not in _ALLOWED_EXTENSIONS:
            raise ValidationError(
                f"Invalid file type. Allowed: {', '.join(sorted(_ALLOWED_EXTENSIONS))}"
            )

        # Read with size limit
        content = await file.read()
        if len(content) > _MAX_LOGO_BYTES:
            raise ValidationError("Logo must be under 2MB")

        # Validate magic bytes
        valid = False
        detected_ext = ext
        for check_ext, magic_list in _ALLOWED_MAGIC.items():
            for magic in magic_list:
                if check_ext == ".webp":
                    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
                        valid = True
                        detected_ext = ".webp"
                        break
                elif content[:len(magic)] == magic:
                    valid = True
                    detected_ext = check_ext
                    break
            if valid:
                break

        if not valid:
            raise ValidationError("File content does not match a supported image format")

        # Write to uploads/logos/{gym_id}.ext
        upload_dir = Path(settings.UPLOAD_DIR) / "logos"
        upload_dir.mkdir(parents=True, exist_ok=True)

        # Remove old logo files
        for old_ext in _ALLOWED_EXTENSIONS:
            old_file = upload_dir / f"{gym_id}{old_ext}"
            if old_file.exists():
                old_file.unlink()

        file_path = upload_dir / f"{gym_id}{detected_ext}"
        file_path.write_bytes(content)

        # Update DB
        relative_url = f"/uploads/logos/{gym_id}{detected_ext}"
        gym.logo_url = relative_url
        await self.db.flush()

        logger.info("logo_uploaded gym_id=%s size=%d", gym_id, len(content))
        return gym

    async def delete_logo(self, gym_id: UUID) -> Gym:
        """Remove the gym logo from disk and DB."""
        gym = await self.get_gym(gym_id)

        if not gym.logo_url:
            return gym

        # Delete file from disk
        file_path = Path(settings.UPLOAD_DIR) / gym.logo_url.lstrip("/uploads/")
        if file_path.exists():
            file_path.unlink()

        gym.logo_url = None
        await self.db.flush()

        logger.info("logo_deleted gym_id=%s", gym_id)
        return gym
