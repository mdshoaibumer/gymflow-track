"""
Tests for the WhatsApp QR attendance system.

Coverage:
1. Rotating code generation and validation (unit)
2. Code expiry (outside validity window)
3. WhatsApp attendance message processing (integration)
4. Phone number normalization (member lookup)
5. Edge cases (expired membership, duplicate check-in, wrong gym)
6. Gym display API endpoint (integration)
7. WhatsApp webhook endpoint (integration)
8. Tenant isolation (cross-gym code rejection)
"""

from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import CheckInSource
from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.services.gym_qr_service import (
    ROTATION_INTERVAL_SECONDS,
    VALIDITY_WINDOW,
    _compute_code,
    _get_time_slot,
    generate_gym_code,
    generate_whatsapp_checkin_url,
    get_code_ttl_seconds,
    validate_gym_code,
)
from app.services.whatsapp_attendance_service import (
    CHECKIN_PATTERN,
    process_attendance_message,
    _find_member_by_phone,
)


# --- QR Service Tests ---


class TestGymQRCodeGeneration:
    """Tests for rotating code generation."""

    def test_generate_code_returns_6_chars(self):
        gym_id = uuid4()
        code = generate_gym_code(gym_id)
        assert len(code) == 6
        assert code.isalnum()
        assert code == code.upper()

    def test_same_gym_same_time_slot_gives_same_code(self):
        gym_id = uuid4()
        code1 = generate_gym_code(gym_id)
        code2 = generate_gym_code(gym_id)
        assert code1 == code2

    def test_different_gyms_give_different_codes(self):
        gym1 = uuid4()
        gym2 = uuid4()
        code1 = generate_gym_code(gym1)
        code2 = generate_gym_code(gym2)
        assert code1 != code2

    def test_different_time_slots_give_different_codes(self):
        gym_id = uuid4()
        slot1 = _get_time_slot()
        code1 = _compute_code(gym_id, slot1)
        code2 = _compute_code(gym_id, slot1 + 1)
        assert code1 != code2


class TestGymQRCodeValidation:
    """Tests for code validation with time window."""

    def test_current_code_is_valid(self):
        gym_id = uuid4()
        code = generate_gym_code(gym_id)
        assert validate_gym_code(gym_id, code) is True

    def test_code_case_insensitive(self):
        gym_id = uuid4()
        code = generate_gym_code(gym_id)
        assert validate_gym_code(gym_id, code.lower()) is True

    def test_code_with_whitespace_is_valid(self):
        gym_id = uuid4()
        code = generate_gym_code(gym_id)
        assert validate_gym_code(gym_id, f"  {code}  ") is True

    def test_wrong_code_is_invalid(self):
        gym_id = uuid4()
        assert validate_gym_code(gym_id, "ZZZZZZ") is False

    def test_code_for_wrong_gym_is_invalid(self):
        gym1 = uuid4()
        gym2 = uuid4()
        code = generate_gym_code(gym1)
        assert validate_gym_code(gym2, code) is False

    def test_code_within_validity_window_is_valid(self):
        """Codes from recent time slots (within ±2 min) should be valid."""
        gym_id = uuid4()
        current_slot = _get_time_slot()

        # Code from 1 slot ago (30 seconds)
        old_code = _compute_code(gym_id, current_slot - 1)
        assert validate_gym_code(gym_id, old_code) is True

        # Code from VALIDITY_WINDOW slots ago (edge of window)
        edge_code = _compute_code(gym_id, current_slot - VALIDITY_WINDOW)
        assert validate_gym_code(gym_id, edge_code) is True

    def test_code_outside_validity_window_is_invalid(self):
        """Codes from beyond the validity window should be rejected."""
        gym_id = uuid4()
        current_slot = _get_time_slot()

        # Code from beyond the window
        expired_code = _compute_code(gym_id, current_slot - VALIDITY_WINDOW - 1)
        assert validate_gym_code(gym_id, expired_code) is False

    def test_future_code_within_window_is_valid(self):
        """Slight clock drift (future codes within window) should work."""
        gym_id = uuid4()
        current_slot = _get_time_slot()
        future_code = _compute_code(gym_id, current_slot + 1)
        assert validate_gym_code(gym_id, future_code) is True


class TestWhatsAppURL:
    """Tests for WhatsApp deeplink generation."""

    def test_url_format(self):
        gym_id = uuid4()
        url = generate_whatsapp_checkin_url("919876543210", gym_id)
        assert url.startswith("https://wa.me/919876543210?text=CHECKIN%20")
        # Code part
        code_part = url.split("CHECKIN%20")[1]
        assert len(code_part) == 6
        assert code_part.isalnum()

    def test_url_changes_with_time(self):
        gym_id = uuid4()
        current_slot = _get_time_slot()

        with patch("app.services.gym_qr_service._get_time_slot", return_value=current_slot):
            url1 = generate_whatsapp_checkin_url("919876543210", gym_id)

        with patch("app.services.gym_qr_service._get_time_slot", return_value=current_slot + 1):
            url2 = generate_whatsapp_checkin_url("919876543210", gym_id)

        assert url1 != url2


class TestCodeTTL:
    """Tests for TTL calculation."""

    def test_ttl_is_positive(self):
        ttl = get_code_ttl_seconds()
        assert ttl > 0
        assert ttl <= ROTATION_INTERVAL_SECONDS


# --- Regex Pattern Tests ---


class TestCheckinPattern:
    """Tests for the CHECKIN message regex pattern."""

    def test_valid_patterns(self):
        assert CHECKIN_PATTERN.match("CHECKIN ABC123") is not None
        assert CHECKIN_PATTERN.match("checkin abc123") is not None
        assert CHECKIN_PATTERN.match("Checkin A7X9K2") is not None
        assert CHECKIN_PATTERN.match("  CHECKIN ABC123  ") is not None
        assert CHECKIN_PATTERN.match("CHECKIN ABCD1234") is not None  # 8 chars

    def test_invalid_patterns(self):
        assert CHECKIN_PATTERN.match("hello world") is None
        assert CHECKIN_PATTERN.match("CHECKIN") is None  # no code
        assert CHECKIN_PATTERN.match("CHECKIN AB") is None  # too short (< 4)
        assert CHECKIN_PATTERN.match("CHECKIN ABCDEFGHI") is None  # too long (> 8)
        assert CHECKIN_PATTERN.match("CHECK IN ABC123") is None  # space in keyword
        assert CHECKIN_PATTERN.match("CHECKOUT ABC123") is None  # wrong keyword

    def test_extracts_code(self):
        match = CHECKIN_PATTERN.match("CHECKIN A7X9K2")
        assert match is not None
        assert match.group(1) == "A7X9K2"


# --- Integration Tests (Require DB) ---


@pytest.fixture
async def wa_gym(db_session: AsyncSession) -> Gym:
    """Gym with a UNIQUE phone number for WhatsApp attendance tests.

    Uses a distinct phone to avoid collisions with sample_gym ("9876543210")
    which is shared across many test fixtures in the full suite.
    """
    from app.models.subscription import GymSubscription, BillingStatus, SubscriptionPlan, PlanTier
    from app.core.cache import get_cache_backend
    import sqlalchemy as sa

    gym = Gym(
        id=uuid4(),
        name="WhatsApp QR Test Gym",
        slug=f"wa-qr-gym-{uuid4().hex[:8]}",
        phone="7777000111",
        email="waqr@testgym.com",
    )
    db_session.add(gym)
    await db_session.flush()

    # Attach active subscription (needed for middleware)
    result = await db_session.execute(
        sa.select(SubscriptionPlan).where(SubscriptionPlan.tier == PlanTier.ELITE)
    )
    plan = result.scalar_one()
    sub = GymSubscription(
        id=uuid4(),
        gym_id=gym.id,
        plan_id=plan.id,
        status=BillingStatus.ACTIVE,
    )
    db_session.add(sub)
    await db_session.flush()
    get_cache_backend().set(f"sub:{gym.id}", "full", 99999)
    return gym


@pytest.fixture
async def wa_member(db_session: AsyncSession, wa_gym: Gym) -> Member:
    """Member with active membership and known phone for WhatsApp tests."""
    member = Member(
        id=uuid4(),
        gym_id=wa_gym.id,
        name="Rahul Kumar",
        phone="8888000222",
        membership_status=MembershipStatus.ACTIVE,
        membership_start=date.today() - timedelta(days=15),
        membership_end=date.today() + timedelta(days=15),
        membership_plan="Monthly",
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def wa_expired_member(db_session: AsyncSession, wa_gym: Gym) -> Member:
    """Member with expired membership for rejection tests."""
    member = Member(
        id=uuid4(),
        gym_id=wa_gym.id,
        name="Expired User",
        phone="8888000333",
        membership_status=MembershipStatus.EXPIRED,
        membership_start=date.today() - timedelta(days=60),
        membership_end=date.today() - timedelta(days=1),
        membership_plan="Monthly",
        amount_paid=0,
    )
    db_session.add(member)
    await db_session.flush()
    return member


# --- WhatsApp Attendance Service Tests ---


@pytest.mark.asyncio
class TestWhatsAppAttendanceProcessing:
    """Integration tests for WhatsApp attendance message processing."""

    async def test_valid_checkin_marks_attendance(
        self, db_session: AsyncSession, wa_gym: Gym, wa_member: Member
    ):
        """Valid code + known member = attendance marked."""
        code = generate_gym_code(wa_gym.id)
        message = f"CHECKIN {code}"

        result = await process_attendance_message(
            db=db_session,
            sender_phone="918888000222",  # wa_member's phone with country code
            message_body=message,
            receiver_phone=wa_gym.phone,
        )

        assert result is not None
        assert result.success is True
        assert "Welcome" in result.message
        assert "Rahul" in result.message
        assert result.attendance is not None
        assert result.attendance.source == CheckInSource.WHATSAPP_QR

    async def test_duplicate_checkin_returns_existing(
        self, db_session: AsyncSession, wa_gym: Gym, wa_member: Member
    ):
        """Second check-in on same day returns existing (idempotent)."""
        code = generate_gym_code(wa_gym.id)
        message = f"CHECKIN {code}"

        # First check-in
        result1 = await process_attendance_message(
            db=db_session,
            sender_phone="918888000222",
            message_body=message,
            receiver_phone=wa_gym.phone,
        )
        assert result1 is not None
        assert result1.success is True

        # Second check-in (same day)
        result2 = await process_attendance_message(
            db=db_session,
            sender_phone="918888000222",
            message_body=message,
            receiver_phone=wa_gym.phone,
        )
        assert result2 is not None
        assert result2.success is True
        assert "already checked in" in result2.message

    async def test_expired_membership_rejected(
        self, db_session: AsyncSession, wa_gym: Gym, wa_expired_member: Member
    ):
        """Expired members are rejected with clear message."""
        code = generate_gym_code(wa_gym.id)
        message = f"CHECKIN {code}"

        result = await process_attendance_message(
            db=db_session,
            sender_phone="918888000333",
            message_body=message,
            receiver_phone=wa_gym.phone,
        )

        assert result is not None
        assert result.success is False
        assert "expired" in result.message.lower()

    async def test_invalid_code_rejected(
        self, db_session: AsyncSession, wa_gym: Gym, wa_member: Member
    ):
        """Invalid/expired codes are rejected."""
        result = await process_attendance_message(
            db=db_session,
            sender_phone="918888000222",
            message_body="CHECKIN ZZZZZZ",
            receiver_phone=wa_gym.phone,
        )

        assert result is not None
        assert result.success is False
        assert "expired" in result.message.lower() or "invalid" in result.message.lower()

    async def test_unknown_phone_rejected(
        self, db_session: AsyncSession, wa_gym: Gym
    ):
        """Unknown phone number gets informative rejection."""
        code = generate_gym_code(wa_gym.id)
        message = f"CHECKIN {code}"

        result = await process_attendance_message(
            db=db_session,
            sender_phone="919999999999",  # Not registered
            message_body=message,
            receiver_phone=wa_gym.phone,
        )

        assert result is not None
        assert result.success is False
        assert "not registered" in result.message.lower()

    async def test_non_checkin_message_returns_none(
        self, db_session: AsyncSession, wa_gym: Gym
    ):
        """Non-checkin messages are ignored (return None)."""
        result = await process_attendance_message(
            db=db_session,
            sender_phone="918888000222",
            message_body="Hello, what are gym timings?",
            receiver_phone=wa_gym.phone,
        )
        assert result is None

    async def test_unknown_gym_phone_rejected(
        self, db_session: AsyncSession, wa_gym: Gym, wa_member: Member
    ):
        """Message to unknown gym number gets rejection."""
        code = generate_gym_code(wa_gym.id)
        result = await process_attendance_message(
            db=db_session,
            sender_phone="918888000222",
            message_body=f"CHECKIN {code}",
            receiver_phone="910000099999",  # Not any gym's number
        )

        assert result is not None
        assert result.success is False
        assert "not linked" in result.message.lower()

    async def test_cross_gym_code_rejected(
        self, db_session: AsyncSession, wa_gym: Gym, other_gym: Gym, wa_member: Member
    ):
        """Code generated for Gym A won't work when sent to Gym B."""
        # Generate code for other_gym but send to wa_gym's phone
        other_code = generate_gym_code(other_gym.id)

        result = await process_attendance_message(
            db=db_session,
            sender_phone="918888000222",
            message_body=f"CHECKIN {other_code}",
            receiver_phone=wa_gym.phone,
        )

        assert result is not None
        assert result.success is False
        # Code won't validate for sample_gym
        assert "invalid" in result.message.lower() or "expired" in result.message.lower()


# --- Phone Number Normalization Tests ---


@pytest.mark.asyncio
class TestPhoneNormalization:
    """Tests for phone number lookup with different formats."""

    async def test_find_member_with_country_code(
        self, db_session: AsyncSession, wa_gym: Gym, wa_member: Member
    ):
        """WhatsApp sends '918888000222', member stored as '8888000222'."""
        from app.repositories.member_repository import MemberRepository

        repo = MemberRepository(db_session)
        member = await _find_member_by_phone(repo, "918888000222", wa_gym.id)
        assert member is not None
        assert member.id == wa_member.id

    async def test_find_member_exact_match(
        self, db_session: AsyncSession, wa_gym: Gym, wa_member: Member
    ):
        """Direct match on stored phone number."""
        from app.repositories.member_repository import MemberRepository

        repo = MemberRepository(db_session)
        member = await _find_member_by_phone(repo, "8888000222", wa_gym.id)
        assert member is not None
        assert member.id == wa_member.id

    async def test_find_member_with_plus_prefix(
        self, db_session: AsyncSession, wa_gym: Gym, wa_member: Member
    ):
        """Phone with + prefix."""
        from app.repositories.member_repository import MemberRepository

        repo = MemberRepository(db_session)
        member = await _find_member_by_phone(repo, "+918888000222", wa_gym.id)
        assert member is not None
        assert member.id == wa_member.id

    async def test_unknown_phone_returns_none(
        self, db_session: AsyncSession, wa_gym: Gym
    ):
        """Non-existent phone returns None."""
        from app.repositories.member_repository import MemberRepository

        repo = MemberRepository(db_session)
        member = await _find_member_by_phone(repo, "919999999999", wa_gym.id)
        assert member is None


# --- API Endpoint Tests ---


@pytest.mark.asyncio
class TestGymDisplayEndpoint:
    """Integration tests for the gym QR display API."""

    async def test_get_qr_data_success(self, client: AsyncClient, sample_gym: Gym):
        """GET /gym-display/{gym_id}/qr-data returns valid QR data."""
        response = await client.get(f"/api/v1/gym-display/{sample_gym.id}/qr-data")
        assert response.status_code == 200

        data = response.json()
        assert data["gym_name"] == sample_gym.name
        assert len(data["code"]) == 6
        assert data["code"].isalnum()
        assert "wa.me" in data["whatsapp_url"]
        assert data["refresh_in_seconds"] > 0
        assert data["refresh_in_seconds"] <= 30

    async def test_get_qr_data_unknown_gym_returns_404(self, client: AsyncClient):
        """Unknown gym_id returns 404."""
        fake_id = uuid4()
        response = await client.get(f"/api/v1/gym-display/{fake_id}/qr-data")
        assert response.status_code == 404

    async def test_get_qr_data_no_auth_required(self, client: AsyncClient, sample_gym: Gym):
        """Display endpoint works without authentication (public)."""
        # No auth headers needed
        response = await client.get(f"/api/v1/gym-display/{sample_gym.id}/qr-data")
        assert response.status_code == 200

    async def test_qr_data_whatsapp_url_contains_code(
        self, client: AsyncClient, sample_gym: Gym
    ):
        """WhatsApp URL in response contains the current code."""
        response = await client.get(f"/api/v1/gym-display/{sample_gym.id}/qr-data")
        data = response.json()
        assert data["code"] in data["whatsapp_url"]


@pytest.mark.asyncio
class TestWhatsAppWebhookEndpoint:
    """Integration tests for the WhatsApp webhook API."""

    async def test_webhook_verification_success(self, client: AsyncClient):
        """GET webhook with correct verify token returns challenge."""
        from app.core.config import settings
        response = await client.get(
            "/api/v1/webhook/whatsapp-attendance",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
                "hub.challenge": "1234567890",
            },
        )
        assert response.status_code == 200
        assert response.json() == 1234567890

    async def test_webhook_verification_wrong_token(self, client: AsyncClient):
        """GET webhook with wrong verify token returns 403."""
        response = await client.get(
            "/api/v1/webhook/whatsapp-attendance",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "wrong_token",
                "hub.challenge": "1234567890",
            },
        )
        assert response.status_code == 403

    async def test_webhook_post_valid_checkin(
        self, client: AsyncClient, wa_gym: Gym, wa_member: Member
    ):
        """POST webhook with valid check-in message returns 200."""
        code = generate_gym_code(wa_gym.id)

        # WhatsApp Cloud API webhook format
        payload = {
            "entry": [
                {
                    "changes": [
                        {
                            "value": {
                                "metadata": {
                                    "display_phone_number": wa_gym.phone,
                                },
                                "messages": [
                                    {
                                        "from": "918888000222",
                                        "type": "text",
                                        "text": {"body": f"CHECKIN {code}"},
                                    }
                                ],
                            }
                        }
                    ]
                }
            ]
        }

        response = await client.post(
            "/api/v1/webhook/whatsapp-attendance",
            json=payload,
        )
        # Always returns 200 (WhatsApp requirement)
        assert response.status_code == 200

    async def test_webhook_post_non_text_message_ignored(self, client: AsyncClient):
        """POST with image/sticker message is silently ignored."""
        payload = {
            "entry": [
                {
                    "changes": [
                        {
                            "value": {
                                "metadata": {"display_phone_number": "9876543210"},
                                "messages": [
                                    {
                                        "from": "919876543210",
                                        "type": "image",
                                    }
                                ],
                            }
                        }
                    ]
                }
            ]
        }

        response = await client.post(
            "/api/v1/webhook/whatsapp-attendance",
            json=payload,
        )
        assert response.status_code == 200

    async def test_webhook_post_empty_body(self, client: AsyncClient):
        """POST with empty/invalid body still returns 200 (no crash)."""
        response = await client.post(
            "/api/v1/webhook/whatsapp-attendance",
            json={},
        )
        assert response.status_code == 200

    async def test_webhook_post_malformed_json(self, client: AsyncClient):
        """POST with non-JSON body returns 200 (graceful handling)."""
        response = await client.post(
            "/api/v1/webhook/whatsapp-attendance",
            content=b"not json",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 200
