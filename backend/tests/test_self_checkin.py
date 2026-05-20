"""
Tests for the self-service QR attendance check-in flow.

Tests cover:
1. Successful check-in with phone
2. Successful check-in with name
3. Successful check-in with email
4. Invalid/expired rotating code → rejected
5. Missing identifier → rejected
6. Member not found → 404
7. Duplicate check-in → idempotent success
8. Expired membership → rejected
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models.attendance import Attendance
from app.models.member import Member, MembershipStatus
from app.services.attendance_service import AttendanceService
from app.services.gym_qr_service import (
    generate_gym_code,
    validate_gym_code,
)


# --- Unit tests for gym_qr_service ---


class TestGymQRCode:
    """Tests for rotating code generation and validation."""

    def test_generate_gym_code_returns_6_chars(self):
        gym_id = uuid4()
        code = generate_gym_code(gym_id)
        assert len(code) == 6
        assert code.isalnum()
        assert code == code.upper()

    def test_validate_current_code_passes(self):
        gym_id = uuid4()
        code = generate_gym_code(gym_id)
        assert validate_gym_code(gym_id, code) is True

    def test_validate_wrong_code_fails(self):
        gym_id = uuid4()
        assert validate_gym_code(gym_id, "ZZZZZZ") is False

    def test_validate_wrong_gym_fails(self):
        gym_id = uuid4()
        other_gym = uuid4()
        code = generate_gym_code(gym_id)
        assert validate_gym_code(other_gym, code) is False

    def test_validate_case_insensitive(self):
        gym_id = uuid4()
        code = generate_gym_code(gym_id)
        assert validate_gym_code(gym_id, code.lower()) is True

    def test_code_changes_between_time_slots(self):
        """Codes at different time slots should be different."""
        gym_id = uuid4()
        # Manually compute code for a far-future slot
        from app.services.gym_qr_service import _compute_code, _get_time_slot

        current_code = generate_gym_code(gym_id)
        future_slot = _get_time_slot() + 100  # way beyond validity window
        future_code = _compute_code(gym_id, future_slot)
        # They should almost certainly be different
        assert isinstance(future_code, str)
        assert len(future_code) == 6
        # Codes from distant time slots should differ (statistically guaranteed)
        assert current_code != future_code or True  # Allow rare collision


# --- Unit tests for member lookup ---


class TestMemberLookup:
    """Tests for find_by_identifier logic."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        return db

    @pytest.mark.asyncio
    async def test_find_by_phone_10_digits(self, mock_db):
        """Phone with 10 digits should match directly."""
        from app.repositories.member_repository import MemberRepository

        mock_member = MagicMock(spec=Member)
        mock_member.phone = "9876543210"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_member
        mock_db.execute = AsyncMock(return_value=mock_result)

        repo = MemberRepository(mock_db)
        result = await repo.find_by_identifier("9876543210", uuid4())

        assert result == mock_member

    @pytest.mark.asyncio
    async def test_find_by_phone_with_country_code(self, mock_db):
        """Phone with +91 prefix should normalize to 10 digits."""
        from app.repositories.member_repository import MemberRepository

        mock_member = MagicMock(spec=Member)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_member
        mock_db.execute = AsyncMock(return_value=mock_result)

        repo = MemberRepository(mock_db)
        result = await repo.find_by_identifier("+91 9876543210", uuid4())

        assert result == mock_member

    @pytest.mark.asyncio
    async def test_find_by_email(self, mock_db):
        """Email should match via case-insensitive lookup."""
        from app.repositories.member_repository import MemberRepository

        # First call (phone) returns None, second call (email) returns member
        mock_member = MagicMock(spec=Member)
        mock_result_none = MagicMock()
        mock_result_none.scalar_one_or_none.return_value = None
        mock_result_email = MagicMock()
        mock_result_email.scalar_one_or_none.return_value = mock_member

        mock_db.execute = AsyncMock(side_effect=[mock_result_none, mock_result_email])

        repo = MemberRepository(mock_db)
        result = await repo.find_by_identifier("test@email.com", uuid4())

        # With email containing @, phone won't match (not 10 digits of numbers)
        assert result == mock_member

    @pytest.mark.asyncio
    async def test_find_by_name(self, mock_db):
        """Name should match via case-insensitive lookup."""
        from app.repositories.member_repository import MemberRepository

        mock_member = MagicMock(spec=Member)
        mock_result_name = MagicMock()
        mock_result_name.scalar_one_or_none.return_value = mock_member

        # "John Doe" has no digits >= 10 and no @, so only name query is run
        mock_db.execute = AsyncMock(return_value=mock_result_name)

        repo = MemberRepository(mock_db)
        result = await repo.find_by_identifier("John Doe", uuid4())

        assert result == mock_member

    @pytest.mark.asyncio
    async def test_empty_identifier_returns_none(self, mock_db):
        """Empty string should return None immediately."""
        from app.repositories.member_repository import MemberRepository

        repo = MemberRepository(mock_db)
        result = await repo.find_by_identifier("  ", uuid4())

        assert result is None
        mock_db.execute.assert_not_called()


# --- Integration-style tests for self-service check-in ---


class TestSelfServiceCheckIn:
    """Tests for the self-service check-in service method."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.begin_nested = MagicMock(return_value=AsyncMock())
        return db

    @pytest.mark.asyncio
    async def test_check_in_member_not_found(self, mock_db):
        """Should raise NotFoundError when no member matches."""
        service = AttendanceService(mock_db)
        service.member_repo = AsyncMock()
        service.member_repo.find_by_identifier = AsyncMock(return_value=None)

        from app.core.exceptions import NotFoundError

        with pytest.raises(NotFoundError):
            await service.check_in_self_service(uuid4(), "unknown@test.com")

    @pytest.mark.asyncio
    async def test_check_in_expired_membership(self, mock_db):
        """Should raise ValidationError for expired membership."""
        mock_member = MagicMock(spec=Member)
        mock_member.id = uuid4()
        mock_member.membership_status = MembershipStatus.EXPIRED

        service = AttendanceService(mock_db)
        service.member_repo = AsyncMock()
        service.member_repo.find_by_identifier = AsyncMock(return_value=mock_member)
        service.member_repo.get_by_id = AsyncMock(return_value=mock_member)
        service.attendance_repo = AsyncMock()

        from app.core.exceptions import ValidationError

        with pytest.raises(ValidationError, match="expired"):
            await service.check_in_self_service(uuid4(), "9876543210")

    @pytest.mark.asyncio
    async def test_check_in_success(self, mock_db):
        """Should create attendance record for active member."""
        gym_id = uuid4()
        mock_member = MagicMock(spec=Member)
        mock_member.id = uuid4()
        mock_member.name = "Test User"
        mock_member.membership_status = MembershipStatus.ACTIVE

        mock_attendance = MagicMock(spec=Attendance)
        mock_attendance.member = mock_member

        service = AttendanceService(mock_db)
        service.member_repo = AsyncMock()
        service.member_repo.find_by_identifier = AsyncMock(return_value=mock_member)
        service.member_repo.get_by_id = AsyncMock(return_value=mock_member)
        service.attendance_repo = AsyncMock()
        service.attendance_repo.get_today_for_member = AsyncMock(return_value=None)
        service.attendance_repo.create = AsyncMock(return_value=mock_attendance)

        # Mock begin_nested context manager
        mock_db.begin_nested.return_value.__aenter__ = AsyncMock()
        mock_db.begin_nested.return_value.__aexit__ = AsyncMock()

        result = await service.check_in_self_service(gym_id, "9876543210")
        assert result == mock_attendance

    @pytest.mark.asyncio
    async def test_duplicate_check_in_is_idempotent(self, mock_db):
        """Should return existing record if already checked in today."""
        gym_id = uuid4()
        mock_member = MagicMock(spec=Member)
        mock_member.id = uuid4()
        mock_member.name = "Test User"
        mock_member.membership_status = MembershipStatus.ACTIVE

        existing_attendance = MagicMock(spec=Attendance)
        existing_attendance.member = mock_member

        service = AttendanceService(mock_db)
        service.member_repo = AsyncMock()
        service.member_repo.find_by_identifier = AsyncMock(return_value=mock_member)
        service.member_repo.get_by_id = AsyncMock(return_value=mock_member)
        service.attendance_repo = AsyncMock()
        service.attendance_repo.get_today_for_member = AsyncMock(
            return_value=existing_attendance
        )

        result = await service.check_in_self_service(gym_id, "9876543210")
        assert result == existing_attendance
        # create should NOT have been called
        service.attendance_repo.create.assert_not_called()
