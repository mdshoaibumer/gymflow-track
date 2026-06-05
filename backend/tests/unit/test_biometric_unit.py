"""
Unit tests for the biometric attendance module — runs WITHOUT a database.

Tests:
- Schema validation (Pydantic models)
- Encryption/decryption logic
- API key generation
- Device authentication logic
- Match score threshold enforcement
"""

import base64
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.schemas.biometric import (
    BiometricCheckInRequest,
    EnrollTemplateRequest,
    RegisterDeviceRequest,
    UpdateDeviceRequest,
)
from app.models.biometric import BiometricType, DeviceStatus


# === Schema Validation ===


class TestRegisterDeviceSchema:
    """Test RegisterDeviceRequest validation."""

    def test_valid_fingerprint_device(self):
        req = RegisterDeviceRequest(
            device_name="Main Entrance Scanner",
            biometric_type="fingerprint",
            device_model="ZKTeco ZK9500",
            serial_number="ZK-2024-001",
            location="Front Desk",
        )
        assert req.device_name == "Main Entrance Scanner"
        assert req.biometric_type == "fingerprint"
        assert req.min_match_score == 0.80  # default

    def test_valid_face_device(self):
        req = RegisterDeviceRequest(
            device_name="Gym Entry Camera",
            biometric_type="face",
            min_match_score=0.90,
        )
        assert req.biometric_type == "face"
        assert req.min_match_score == 0.90

    def test_min_match_score_bounds(self):
        # Valid lower bound
        req = RegisterDeviceRequest(
            device_name="Test", biometric_type="fingerprint", min_match_score=0.50
        )
        assert req.min_match_score == 0.50

        # Valid upper bound
        req = RegisterDeviceRequest(
            device_name="Test", biometric_type="fingerprint", min_match_score=1.0
        )
        assert req.min_match_score == 1.0

    def test_min_match_score_too_low(self):
        with pytest.raises(Exception):  # ValidationError
            RegisterDeviceRequest(
                device_name="Test", biometric_type="fingerprint", min_match_score=0.3
            )

    def test_min_match_score_too_high(self):
        with pytest.raises(Exception):  # ValidationError
            RegisterDeviceRequest(
                device_name="Test", biometric_type="fingerprint", min_match_score=1.5
            )

    def test_device_name_required(self):
        with pytest.raises(Exception):
            RegisterDeviceRequest(biometric_type="fingerprint")

    def test_device_name_max_length(self):
        with pytest.raises(Exception):
            RegisterDeviceRequest(
                device_name="A" * 101, biometric_type="fingerprint"
            )


class TestEnrollTemplateSchema:
    """Test EnrollTemplateRequest validation."""

    def test_valid_enrollment(self):
        template_b64 = base64.b64encode(os.urandom(256)).decode()
        req = EnrollTemplateRequest(
            member_id=uuid4(),
            template_data_b64=template_b64,
            biometric_type="fingerprint",
            quality_score=0.95,
            template_format="ISO_19794_2",
        )
        assert req.quality_score == 0.95
        assert req.template_format == "ISO_19794_2"

    def test_quality_score_bounds(self):
        template_b64 = base64.b64encode(os.urandom(256)).decode()
        # Valid
        req = EnrollTemplateRequest(
            member_id=uuid4(),
            template_data_b64=template_b64,
            biometric_type="fingerprint",
            quality_score=0.0,
        )
        assert req.quality_score == 0.0

        # Invalid: > 1.0
        with pytest.raises(Exception):
            EnrollTemplateRequest(
                member_id=uuid4(),
                template_data_b64=template_b64,
                biometric_type="fingerprint",
                quality_score=1.5,
            )

    def test_optional_fields(self):
        template_b64 = base64.b64encode(os.urandom(256)).decode()
        req = EnrollTemplateRequest(
            member_id=uuid4(),
            template_data_b64=template_b64,
            biometric_type="face",
        )
        assert req.quality_score is None
        assert req.template_format is None


class TestBiometricCheckInSchema:
    """Test BiometricCheckInRequest validation."""

    def test_valid_check_in(self):
        req = BiometricCheckInRequest(
            member_id=uuid4(),
            match_score=0.92,
            template_id=uuid4(),
        )
        assert req.match_score == 0.92

    def test_match_score_bounds(self):
        # Valid: 0.0
        req = BiometricCheckInRequest(member_id=uuid4(), match_score=0.0)
        assert req.match_score == 0.0

        # Valid: 1.0
        req = BiometricCheckInRequest(member_id=uuid4(), match_score=1.0)
        assert req.match_score == 1.0

        # Invalid: negative
        with pytest.raises(Exception):
            BiometricCheckInRequest(member_id=uuid4(), match_score=-0.1)

        # Invalid: > 1.0
        with pytest.raises(Exception):
            BiometricCheckInRequest(member_id=uuid4(), match_score=1.1)

    def test_template_id_optional(self):
        req = BiometricCheckInRequest(member_id=uuid4(), match_score=0.85)
        assert req.template_id is None


class TestUpdateDeviceSchema:
    """Test UpdateDeviceRequest validation."""

    def test_all_none(self):
        req = UpdateDeviceRequest()
        assert req.device_name is None
        assert req.location is None
        assert req.min_match_score is None
        assert req.status is None

    def test_partial_update(self):
        req = UpdateDeviceRequest(
            device_name="New Name",
            min_match_score=0.85,
        )
        assert req.device_name == "New Name"
        assert req.min_match_score == 0.85
        assert req.location is None


# === Encryption Logic ===


class TestEncryption:
    """Test AES-256-GCM encryption/decryption."""

    @patch("app.services.biometric_service.settings")
    def test_encrypt_decrypt_roundtrip(self, mock_settings):
        """Encrypt then decrypt should return original data."""
        # Set up a test encryption key
        test_key = base64.b64encode(os.urandom(32)).decode()
        mock_settings.BIOMETRIC_ENCRYPTION_KEY = test_key

        # Reset cached key
        import app.services.biometric_service as bio_svc
        bio_svc._ENCRYPTION_KEY = None

        from app.services.biometric_service import _encrypt_template, _decrypt_template

        plaintext = os.urandom(512)  # Simulated biometric template
        ciphertext, iv = _encrypt_template(plaintext)

        # Ciphertext should differ from plaintext
        assert ciphertext != plaintext
        # IV should be 12 bytes (96-bit for GCM)
        assert len(iv) == 12

        # Decrypt should return original
        decrypted = _decrypt_template(ciphertext, iv)
        assert decrypted == plaintext

        # Cleanup
        bio_svc._ENCRYPTION_KEY = None

    @patch("app.services.biometric_service.settings")
    def test_different_ivs_produce_different_ciphertext(self, mock_settings):
        """Same plaintext with different IVs should produce different ciphertext."""
        test_key = base64.b64encode(os.urandom(32)).decode()
        mock_settings.BIOMETRIC_ENCRYPTION_KEY = test_key

        import app.services.biometric_service as bio_svc
        bio_svc._ENCRYPTION_KEY = None

        from app.services.biometric_service import _encrypt_template

        plaintext = os.urandom(256)
        ct1, iv1 = _encrypt_template(plaintext)
        ct2, iv2 = _encrypt_template(plaintext)

        # Different IVs
        assert iv1 != iv2
        # Different ciphertexts
        assert ct1 != ct2

        bio_svc._ENCRYPTION_KEY = None

    @patch("app.services.biometric_service.settings")
    def test_tampered_ciphertext_fails(self, mock_settings):
        """Modifying ciphertext should cause decryption to fail."""
        test_key = base64.b64encode(os.urandom(32)).decode()
        mock_settings.BIOMETRIC_ENCRYPTION_KEY = test_key

        import app.services.biometric_service as bio_svc
        bio_svc._ENCRYPTION_KEY = None

        from app.services.biometric_service import _encrypt_template, _decrypt_template

        plaintext = os.urandom(256)
        ciphertext, iv = _encrypt_template(plaintext)

        # Tamper with ciphertext
        tampered = bytearray(ciphertext)
        tampered[0] ^= 0xFF
        tampered = bytes(tampered)

        with pytest.raises(Exception):  # InvalidTag from cryptography
            _decrypt_template(tampered, iv)

        bio_svc._ENCRYPTION_KEY = None


# === API Key Generation ===


class TestApiKeyGeneration:
    """Test device API key generation and verification."""

    def test_generate_key_format(self):
        from app.services.biometric_service import _generate_api_key

        plain_key, hashed_key, prefix = _generate_api_key()

        # Key starts with prefix
        assert plain_key.startswith("gfbio_")
        # Prefix is first 12 chars
        assert prefix == plain_key[:12]
        # Hash is bcrypt format
        assert hashed_key.startswith("$2b$")
        # Key is long enough
        assert len(plain_key) >= 40

    def test_verify_correct_key(self):
        from app.services.biometric_service import _generate_api_key, _verify_api_key

        plain_key, hashed_key, _ = _generate_api_key()
        assert _verify_api_key(plain_key, hashed_key) is True

    def test_verify_wrong_key(self):
        from app.services.biometric_service import _generate_api_key, _verify_api_key

        _, hashed_key, _ = _generate_api_key()
        assert _verify_api_key("wrong_key_entirely", hashed_key) is False

    def test_keys_are_unique(self):
        from app.services.biometric_service import _generate_api_key

        key1, _, _ = _generate_api_key()
        key2, _, _ = _generate_api_key()
        assert key1 != key2


# === Model Enum Tests ===


class TestBiometricEnums:
    """Test biometric model enums."""

    def test_biometric_types(self):
        assert BiometricType.FINGERPRINT.value == "fingerprint"
        assert BiometricType.FACE.value == "face"

    def test_device_statuses(self):
        assert DeviceStatus.ACTIVE.value == "active"
        assert DeviceStatus.INACTIVE.value == "inactive"
        assert DeviceStatus.REVOKED.value == "revoked"

    def test_checkin_source_includes_biometric(self):
        from app.models.attendance import CheckInSource
        assert CheckInSource.BIOMETRIC.value == "biometric"


# === Service Logic (Mocked DB) ===


class TestBiometricServiceValidation:
    """Test service-level validation without hitting the database."""

    @pytest.mark.asyncio
    @patch("app.services.biometric_service.settings")
    async def test_enroll_rejects_tiny_template(self, mock_settings):
        """Templates smaller than 32 bytes are rejected."""
        test_key = base64.b64encode(os.urandom(32)).decode()
        mock_settings.BIOMETRIC_ENCRYPTION_KEY = test_key

        import app.services.biometric_service as bio_svc
        bio_svc._ENCRYPTION_KEY = None

        from app.services.biometric_service import BiometricService
        from app.core.exceptions import ValidationError

        mock_db = AsyncMock()
        service = BiometricService(mock_db)
        # Mock member lookup to return a member
        service.member_repo = AsyncMock()
        service.member_repo.get_by_id = AsyncMock(return_value=MagicMock(id=uuid4()))

        # Template too small (< 32 bytes)
        tiny_template = base64.b64encode(b"tiny").decode()

        with pytest.raises(ValidationError, match="too small"):
            await service.enroll_template(
                gym_id=uuid4(),
                member_id=uuid4(),
                device_id=uuid4(),
                template_data_b64=tiny_template,
                biometric_type="fingerprint",
            )

        bio_svc._ENCRYPTION_KEY = None

    @pytest.mark.asyncio
    @patch("app.services.biometric_service.settings")
    async def test_enroll_rejects_oversized_template(self, mock_settings):
        """Templates larger than 50KB are rejected."""
        test_key = base64.b64encode(os.urandom(32)).decode()
        mock_settings.BIOMETRIC_ENCRYPTION_KEY = test_key

        import app.services.biometric_service as bio_svc
        bio_svc._ENCRYPTION_KEY = None

        from app.services.biometric_service import BiometricService
        from app.core.exceptions import ValidationError

        mock_db = AsyncMock()
        service = BiometricService(mock_db)
        service.member_repo = AsyncMock()
        service.member_repo.get_by_id = AsyncMock(return_value=MagicMock(id=uuid4()))

        # Template too large (> 50KB)
        large_template = base64.b64encode(os.urandom(60_000)).decode()

        with pytest.raises(ValidationError, match="exceeds maximum"):
            await service.enroll_template(
                gym_id=uuid4(),
                member_id=uuid4(),
                device_id=uuid4(),
                template_data_b64=large_template,
                biometric_type="fingerprint",
            )

        bio_svc._ENCRYPTION_KEY = None

    @pytest.mark.asyncio
    async def test_enroll_rejects_invalid_base64(self):
        """Invalid base64 is rejected."""
        from app.services.biometric_service import BiometricService
        from app.core.exceptions import ValidationError

        mock_db = AsyncMock()
        service = BiometricService(mock_db)
        service.member_repo = AsyncMock()
        service.member_repo.get_by_id = AsyncMock(return_value=MagicMock(id=uuid4()))

        with pytest.raises(ValidationError, match="valid base64"):
            await service.enroll_template(
                gym_id=uuid4(),
                member_id=uuid4(),
                device_id=uuid4(),
                template_data_b64="not-valid-base64!!!",
                biometric_type="fingerprint",
            )

    @pytest.mark.asyncio
    async def test_enroll_rejects_invalid_biometric_type(self):
        """Invalid biometric type is rejected."""
        from app.services.biometric_service import BiometricService
        from app.core.exceptions import ValidationError

        mock_db = AsyncMock()
        service = BiometricService(mock_db)

        with pytest.raises(ValidationError, match="Invalid biometric type"):
            await service.enroll_template(
                gym_id=uuid4(),
                member_id=uuid4(),
                device_id=uuid4(),
                template_data_b64=base64.b64encode(os.urandom(256)).decode(),
                biometric_type="retina",  # Not supported
            )

    @pytest.mark.asyncio
    async def test_check_in_rejects_low_match_score(self):
        """Match score below device threshold is rejected."""
        from app.services.biometric_service import BiometricService
        from app.core.exceptions import ValidationError

        mock_db = AsyncMock()
        service = BiometricService(mock_db)

        # Create a mock device with threshold 0.85
        mock_device = MagicMock()
        mock_device.gym_id = uuid4()
        mock_device.min_match_score = 0.85
        mock_device.id = uuid4()

        with pytest.raises(ValidationError, match="confidence too low"):
            await service.biometric_check_in(
                device=mock_device,
                member_id=uuid4(),
                match_score=0.70,  # Below 0.85 threshold
            )

    @pytest.mark.asyncio
    async def test_register_device_rejects_invalid_type(self):
        """Invalid biometric type is rejected at registration."""
        from app.services.biometric_service import BiometricService
        from app.core.exceptions import ValidationError

        mock_db = AsyncMock()
        service = BiometricService(mock_db)

        with pytest.raises(ValidationError, match="Invalid biometric type"):
            await service.register_device(
                gym_id=uuid4(),
                device_name="Test Scanner",
                biometric_type="iris",  # Not supported
            )
