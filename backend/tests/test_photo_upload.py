"""
Integration tests for Member Photo Upload/Delete operations.

Tests:
- Upload photo (JPEG, PNG, WebP)
- Upload validation (size, type, magic bytes)
- Delete photo
- Replace photo (upload over existing)
- Tenant isolation (can't upload to another gym's member)
- WebP validation rejects WAV/AVI files disguised as .webp
- Cleanup on delete
"""

import io
import struct
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member


# ---- Fixtures specific to photo tests ----


@pytest.fixture
async def sample_member_id(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession, sample_gym
) -> str:
    """Create a member and return its ID."""
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Photo Test Member",
        phone="9876500099",
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return str(member.id)


@pytest.fixture
async def sample_member_id_no_photo(
    db_session: AsyncSession, sample_gym
) -> str:
    """Create a member without a photo and return its ID."""
    member = Member(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="No Photo Member",
        phone="9876500098",
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return str(member.id)


@pytest.fixture
async def other_gym_member_id(
    db_session: AsyncSession, other_gym
) -> str:
    """Create a member in another gym for isolation tests."""
    member = Member(
        id=uuid4(),
        gym_id=other_gym.id,
        name="Other Gym Member",
        phone="9000000099",
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return str(member.id)


def _make_jpeg(size_bytes: int = 100) -> bytes:
    """Create minimal valid JPEG bytes."""
    # JPEG magic + padding
    header = b"\xff\xd8\xff\xe0"
    return header + b"\x00" * (size_bytes - len(header))


def _make_png(size_bytes: int = 100) -> bytes:
    """Create minimal valid PNG bytes."""
    header = b"\x89PNG\r\n\x1a\n"
    return header + b"\x00" * (size_bytes - len(header))


def _make_webp(size_bytes: int = 100) -> bytes:
    """Create minimal valid WebP bytes (RIFF....WEBP)."""
    # RIFF header (4 bytes) + file size (4 bytes LE) + WEBP (4 bytes)
    file_size = size_bytes - 8  # RIFF size excludes first 8 bytes
    header = b"RIFF" + struct.pack("<I", file_size) + b"WEBP"
    return header + b"\x00" * (size_bytes - len(header))


def _make_wav(size_bytes: int = 100) -> bytes:
    """Create WAV-like bytes (RIFF....WAVE) — should be REJECTED as WebP."""
    file_size = size_bytes - 8
    header = b"RIFF" + struct.pack("<I", file_size) + b"WAVE"
    return header + b"\x00" * (size_bytes - len(header))


def _make_avi(size_bytes: int = 100) -> bytes:
    """Create AVI-like bytes (RIFF....AVI ) — should be REJECTED as WebP."""
    file_size = size_bytes - 8
    header = b"RIFF" + struct.pack("<I", file_size) + b"AVI "
    return header + b"\x00" * (size_bytes - len(header))


class TestUploadPhoto:
    """Test member photo upload endpoint."""

    async def test_upload_jpeg_success(
        self, client: AsyncClient, auth_headers: dict, sample_member_id: str
    ):
        """Upload a valid JPEG photo."""
        content = _make_jpeg(1024)
        response = await client.post(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=auth_headers,
            files={"file": ("photo.jpg", io.BytesIO(content), "image/jpeg")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["photo_url"] is not None
        assert data["photo_url"].endswith(".jpg")
        assert sample_member_id in data["photo_url"]

    async def test_upload_png_success(
        self, client: AsyncClient, auth_headers: dict, sample_member_id: str
    ):
        """Upload a valid PNG photo."""
        content = _make_png(2048)
        response = await client.post(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=auth_headers,
            files={"file": ("photo.png", io.BytesIO(content), "image/png")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["photo_url"] is not None
        assert data["photo_url"].endswith(".png")

    async def test_upload_webp_success(
        self, client: AsyncClient, auth_headers: dict, sample_member_id: str
    ):
        """Upload a valid WebP photo."""
        content = _make_webp(2048)
        response = await client.post(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=auth_headers,
            files={"file": ("photo.webp", io.BytesIO(content), "image/webp")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["photo_url"] is not None
        assert data["photo_url"].endswith(".webp")

    async def test_upload_rejects_invalid_extension(
        self, client: AsyncClient, auth_headers: dict, sample_member_id: str
    ):
        """Reject files with unsupported extensions."""
        content = b"fake content for a gif file"
        response = await client.post(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=auth_headers,
            files={"file": ("photo.gif", io.BytesIO(content), "image/gif")},
        )

        assert response.status_code == 422
        assert "Invalid file type" in response.json()["detail"]

    async def test_upload_rejects_oversized_file(
        self, client: AsyncClient, auth_headers: dict, sample_member_id: str
    ):
        """Reject files larger than 5MB."""
        # Create a 6MB file with valid JPEG header
        content = _make_jpeg(6 * 1024 * 1024)
        response = await client.post(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=auth_headers,
            files={"file": ("big.jpg", io.BytesIO(content), "image/jpeg")},
        )

        assert response.status_code == 400
        assert "under" in response.json()["detail"].lower() or "5MB" in response.json()["detail"]

    async def test_upload_rejects_mismatched_magic_bytes(
        self, client: AsyncClient, auth_headers: dict, sample_member_id: str
    ):
        """Reject files where extension doesn't match actual content (not an image)."""
        # Text file pretending to be JPEG
        content = b"This is just plain text, not a real image."
        response = await client.post(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=auth_headers,
            files={"file": ("fake.jpg", io.BytesIO(content), "image/jpeg")},
        )

        assert response.status_code == 400
        assert "does not match" in response.json()["detail"]

    async def test_upload_rejects_wav_disguised_as_webp(
        self, client: AsyncClient, auth_headers: dict, sample_member_id: str
    ):
        """WAV files start with RIFF but have WAVE at offset 8 — must be rejected."""
        content = _make_wav(2048)
        response = await client.post(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=auth_headers,
            files={"file": ("audio.webp", io.BytesIO(content), "image/webp")},
        )

        assert response.status_code == 400
        assert "does not match" in response.json()["detail"]

    async def test_upload_rejects_avi_disguised_as_webp(
        self, client: AsyncClient, auth_headers: dict, sample_member_id: str
    ):
        """AVI files start with RIFF but have AVI at offset 8 — must be rejected."""
        content = _make_avi(2048)
        response = await client.post(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=auth_headers,
            files={"file": ("video.webp", io.BytesIO(content), "image/webp")},
        )

        assert response.status_code == 400
        assert "does not match" in response.json()["detail"]

    async def test_upload_replaces_existing_photo(
        self, client: AsyncClient, auth_headers: dict, sample_member_id: str
    ):
        """Uploading a new photo replaces the old one."""
        # Upload first photo (JPEG)
        content1 = _make_jpeg(512)
        resp1 = await client.post(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=auth_headers,
            files={"file": ("first.jpg", io.BytesIO(content1), "image/jpeg")},
        )
        assert resp1.status_code == 200
        url1 = resp1.json()["photo_url"]

        # Upload second photo (PNG) — should replace
        content2 = _make_png(512)
        resp2 = await client.post(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=auth_headers,
            files={"file": ("second.png", io.BytesIO(content2), "image/png")},
        )
        assert resp2.status_code == 200
        url2 = resp2.json()["photo_url"]

        assert url1 != url2
        assert url2.endswith(".png")

    async def test_upload_requires_admin_role(
        self, client: AsyncClient, staff_headers: dict, sample_member_id: str
    ):
        """Staff users cannot upload photos — only OWNER/ADMIN."""
        content = _make_jpeg(256)
        response = await client.post(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=staff_headers,
            files={"file": ("photo.jpg", io.BytesIO(content), "image/jpeg")},
        )

        assert response.status_code == 403

    async def test_upload_rejects_nonexistent_member(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Upload to a non-existent member returns 404."""
        fake_id = str(uuid4())
        content = _make_jpeg(256)
        response = await client.post(
            f"/api/v1/members/{fake_id}/photo",
            headers=auth_headers,
            files={"file": ("photo.jpg", io.BytesIO(content), "image/jpeg")},
        )

        assert response.status_code == 404


class TestDeletePhoto:
    """Test member photo delete endpoint."""

    async def test_delete_photo_success(
        self, client: AsyncClient, auth_headers: dict, sample_member_id: str
    ):
        """Delete an existing photo."""
        # First upload a photo
        content = _make_jpeg(512)
        upload_resp = await client.post(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=auth_headers,
            files={"file": ("photo.jpg", io.BytesIO(content), "image/jpeg")},
        )
        assert upload_resp.status_code == 200
        assert upload_resp.json()["photo_url"] is not None

        # Now delete it
        response = await client.delete(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["photo_url"] is None

    async def test_delete_photo_no_photo_returns_404(
        self, client: AsyncClient, auth_headers: dict, sample_member_id_no_photo: str
    ):
        """Deleting when no photo exists returns 404."""
        response = await client.delete(
            f"/api/v1/members/{sample_member_id_no_photo}/photo",
            headers=auth_headers,
        )

        assert response.status_code == 404
        assert "no photo" in response.json()["detail"].lower()

    async def test_delete_photo_requires_admin_role(
        self, client: AsyncClient, staff_headers: dict, sample_member_id: str
    ):
        """Staff users cannot delete photos — only OWNER/ADMIN."""
        response = await client.delete(
            f"/api/v1/members/{sample_member_id}/photo",
            headers=staff_headers,
        )

        assert response.status_code == 403


class TestPhotoTenantIsolation:
    """Ensure photos respect multi-tenant boundaries."""

    async def test_cannot_upload_to_other_gym_member(
        self, client: AsyncClient, auth_headers: dict, other_gym_member_id: str
    ):
        """Cannot upload photo to a member belonging to a different gym."""
        content = _make_jpeg(256)
        response = await client.post(
            f"/api/v1/members/{other_gym_member_id}/photo",
            headers=auth_headers,
            files={"file": ("photo.jpg", io.BytesIO(content), "image/jpeg")},
        )

        assert response.status_code == 404

    async def test_cannot_delete_other_gym_member_photo(
        self, client: AsyncClient, auth_headers: dict, other_gym_member_id: str
    ):
        """Cannot delete photo of a member from a different gym."""
        response = await client.delete(
            f"/api/v1/members/{other_gym_member_id}/photo",
            headers=auth_headers,
        )

        assert response.status_code == 404
