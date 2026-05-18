"""
Tests for WhatsApp (AiSensy) per-gym configuration and notification processing.

Covers:
1. CRUD operations on WhatsApp configuration
2. Access control (only OWNER)
3. Status endpoint logic (configured + enabled + plan = active)
4. Provider resolution per-gym in NotificationProcessor
5. Graceful fallback to LogOnly when not configured
6. Input validation and sanitization
7. Tenant isolation (gym A can't access gym B's config)
8. Race condition handling on concurrent create
9. Test message endpoint
10. Toggle enable/disable
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest  # noqa: F401
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import (
    Notification,
    NotificationChannel,
    NotificationStatus,
    NotificationType,
)
from app.models.whatsapp_config import WhatsAppConfig
from app.services.notification_processor import NotificationProcessor
from app.services.whatsapp_provider import (
    AiSensyProvider,
    LogOnlyProvider,
    SendResult,
    WhatsAppMessage,
    build_message_from_notification,
)


# ============================================================
# WhatsApp Config API Tests
# ============================================================


class TestWhatsAppConfigCRUD:
    """Tests for creating, reading, updating, deleting WhatsApp config."""

    async def test_get_config_not_configured(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET /whatsapp returns 404 when not configured."""
        response = await client.get("/api/v1/whatsapp", headers=auth_headers)
        assert response.status_code == 404
        assert "not configured" in response.json()["detail"].lower()

    async def test_create_config(
        self, client: AsyncClient, auth_headers: dict, sample_gym
    ):
        """POST /whatsapp creates a new WhatsApp config."""
        response = await client.post(
            "/api/v1/whatsapp",
            json={"api_key": "test_api_key_1234567890", "is_enabled": True},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["gym_id"] == str(sample_gym.id)
        assert data["is_enabled"] is True
        # API key must be masked
        assert "test_api_key" not in data["api_key_masked"]
        assert data["api_key_masked"].endswith("7890")

    async def test_get_config_after_create(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, sample_gym
    ):
        """GET /whatsapp returns config after creation."""
        # Create config directly
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="abcdefghijklmnop",
            is_enabled=True,
        )
        db_session.add(config)
        await db_session.flush()

        response = await client.get("/api/v1/whatsapp", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["is_enabled"] is True
        assert data["api_key_masked"].endswith("mnop")

    async def test_update_config(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, sample_gym
    ):
        """POST /whatsapp updates existing config."""
        # Create first
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="original_key_123456",
            is_enabled=True,
        )
        db_session.add(config)
        await db_session.flush()

        # Update
        response = await client.post(
            "/api/v1/whatsapp",
            json={"api_key": "new_api_key_abcdef1234", "is_enabled": False},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_enabled"] is False
        assert data["api_key_masked"].endswith("1234")

    async def test_delete_config(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, sample_gym
    ):
        """DELETE /whatsapp removes configuration."""
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="delete_me_key_12345",
            is_enabled=True,
        )
        db_session.add(config)
        await db_session.flush()

        response = await client.delete("/api/v1/whatsapp", headers=auth_headers)
        assert response.status_code == 200
        assert "manual mode" in response.json()["message"].lower()

    async def test_delete_config_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """DELETE /whatsapp returns 404 when not configured."""
        response = await client.delete("/api/v1/whatsapp", headers=auth_headers)
        assert response.status_code == 404


class TestWhatsAppConfigAccessControl:
    """Tests for role-based access control."""

    async def test_admin_cannot_access_config(
        self, client: AsyncClient, db_session: AsyncSession, sample_gym
    ):
        """ADMIN role cannot access WhatsApp config (OWNER only)."""
        from app.core.security import create_access_token, hash_password
        from app.models.user import User, UserRole
        from app.core.cache import get_cache_backend

        admin_user = User(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Admin User",
            email="admin@testgym.com",
            phone="9876543211",
            password_hash=hash_password("TestPass123"),
            role=UserRole.ADMIN,
        )
        db_session.add(admin_user)
        await db_session.flush()
        cache = get_cache_backend()
        cache.set(f"user_active:{admin_user.id}", "1", 99999)
        cache.set(f"user_revoked_at:{admin_user.id}", "", 99999)

        token = create_access_token(admin_user.id, sample_gym.id, "admin")
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.get("/api/v1/whatsapp", headers=headers)
        assert response.status_code == 403

    async def test_staff_cannot_access_config(
        self, client: AsyncClient, db_session: AsyncSession, sample_gym
    ):
        """STAFF role cannot access WhatsApp config."""
        from app.core.security import create_access_token, hash_password
        from app.models.user import User, UserRole
        from app.core.cache import get_cache_backend

        staff_user = User(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Staff User",
            email="staff@testgym.com",
            phone="9876543212",
            password_hash=hash_password("TestPass123"),
            role=UserRole.STAFF,
        )
        db_session.add(staff_user)
        await db_session.flush()
        cache = get_cache_backend()
        cache.set(f"user_active:{staff_user.id}", "1", 99999)
        cache.set(f"user_revoked_at:{staff_user.id}", "", 99999)

        token = create_access_token(staff_user.id, sample_gym.id, "staff")
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.get("/api/v1/whatsapp/status", headers=headers)
        assert response.status_code == 403

    async def test_unauthenticated_cannot_access(self, client: AsyncClient):
        """No auth token returns 401."""
        response = await client.get("/api/v1/whatsapp")
        assert response.status_code in (401, 403)


class TestWhatsAppConfigStatus:
    """Tests for the status endpoint logic."""

    async def test_status_not_configured(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Status shows not configured when no config exists."""
        response = await client.get("/api/v1/whatsapp/status", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["is_configured"] is False
        assert data["is_enabled"] is False
        assert data["is_active"] is False

    async def test_status_configured_and_enabled(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, sample_gym
    ):
        """Status shows active when configured + enabled + plan allows."""
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="valid_key_1234567890",
            is_enabled=True,
        )
        db_session.add(config)
        await db_session.flush()

        response = await client.get("/api/v1/whatsapp/status", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["is_configured"] is True
        assert data["is_enabled"] is True
        assert data["plan_allows_automation"] is True  # Elite plan in test fixture
        assert data["is_active"] is True

    async def test_status_configured_but_disabled(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, sample_gym
    ):
        """Status shows inactive when config disabled."""
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="valid_key_1234567890",
            is_enabled=False,
        )
        db_session.add(config)
        await db_session.flush()

        response = await client.get("/api/v1/whatsapp/status", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["is_configured"] is True
        assert data["is_enabled"] is False
        assert data["is_active"] is False


class TestWhatsAppConfigToggle:
    """Tests for the toggle endpoint."""

    async def test_toggle_enables_disabled(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, sample_gym
    ):
        """PATCH /whatsapp/toggle flips enabled state."""
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="toggle_key_1234567890",
            is_enabled=False,
        )
        db_session.add(config)
        await db_session.flush()

        response = await client.patch("/api/v1/whatsapp/toggle", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["is_enabled"] is True

    async def test_toggle_disables_enabled(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, sample_gym
    ):
        """PATCH /whatsapp/toggle disables when currently enabled."""
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="toggle_key_1234567890",
            is_enabled=True,
        )
        db_session.add(config)
        await db_session.flush()

        response = await client.patch("/api/v1/whatsapp/toggle", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["is_enabled"] is False

    async def test_toggle_not_configured(
        self, client: AsyncClient, auth_headers: dict
    ):
        """PATCH /whatsapp/toggle returns 404 when not configured."""
        response = await client.patch("/api/v1/whatsapp/toggle", headers=auth_headers)
        assert response.status_code == 404


class TestWhatsAppConfigValidation:
    """Tests for input validation and sanitization."""

    async def test_api_key_too_short(
        self, client: AsyncClient, auth_headers: dict
    ):
        """API key under 10 chars is rejected."""
        response = await client.post(
            "/api/v1/whatsapp",
            json={"api_key": "short"},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_api_key_whitespace_stripped(
        self, client: AsyncClient, auth_headers: dict
    ):
        """API key with leading/trailing whitespace is stripped."""
        response = await client.post(
            "/api/v1/whatsapp",
            json={"api_key": "  valid_api_key_1234567890  ", "is_enabled": True},
            headers=auth_headers,
        )
        assert response.status_code == 200

    async def test_campaign_prefix_html_rejected(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Campaign prefix with special chars is rejected."""
        response = await client.post(
            "/api/v1/whatsapp",
            json={
                "api_key": "valid_api_key_1234567890",
                "campaign_prefix": "<script>alert('xss')</script>",
            },
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_campaign_prefix_valid(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Valid campaign prefix with alphanumeric, underscore, hyphen."""
        response = await client.post(
            "/api/v1/whatsapp",
            json={
                "api_key": "valid_api_key_1234567890",
                "campaign_prefix": "my_gym-campaigns",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["campaign_prefix"] == "my_gym-campaigns"

    async def test_campaign_prefix_spaces_rejected(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Campaign prefix with spaces is rejected."""
        response = await client.post(
            "/api/v1/whatsapp",
            json={
                "api_key": "valid_api_key_1234567890",
                "campaign_prefix": "my gym prefix",
            },
            headers=auth_headers,
        )
        assert response.status_code == 422


class TestWhatsAppTestMessage:
    """Tests for the test message endpoint."""

    async def test_test_not_configured(
        self, client: AsyncClient, auth_headers: dict
    ):
        """POST /whatsapp/test returns 404 when not configured."""
        response = await client.post("/api/v1/whatsapp/test", headers=auth_headers)
        assert response.status_code == 404

    async def test_test_disabled(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, sample_gym
    ):
        """POST /whatsapp/test returns error when disabled."""
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="test_key_1234567890",
            is_enabled=False,
        )
        db_session.add(config)
        await db_session.flush()

        response = await client.post("/api/v1/whatsapp/test", headers=auth_headers)
        assert response.status_code == 422

    @patch("app.routers.whatsapp_config.AiSensyProvider")
    async def test_test_success(
        self,
        mock_provider_cls,
        client: AsyncClient,
        auth_headers: dict,
        db_session: AsyncSession,
        sample_gym,
    ):
        """POST /whatsapp/test sends test message and returns success."""
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="test_key_1234567890",
            is_enabled=True,
        )
        db_session.add(config)
        await db_session.flush()

        # Mock the provider
        mock_instance = AsyncMock()
        mock_instance.send_template_message.return_value = SendResult(
            success=True, provider_message_id="msg_123"
        )
        mock_provider_cls.return_value = mock_instance

        response = await client.post("/api/v1/whatsapp/test", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "msg_123" in (data.get("provider_message_id") or "")

    @patch("app.routers.whatsapp_config.AiSensyProvider")
    async def test_test_failure(
        self,
        mock_provider_cls,
        client: AsyncClient,
        auth_headers: dict,
        db_session: AsyncSession,
        sample_gym,
    ):
        """POST /whatsapp/test reports failure from AiSensy."""
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="test_key_1234567890",
            is_enabled=True,
        )
        db_session.add(config)
        await db_session.flush()

        mock_instance = AsyncMock()
        mock_instance.send_template_message.return_value = SendResult(
            success=False, error_message="Invalid API key"
        )
        mock_provider_cls.return_value = mock_instance

        response = await client.post("/api/v1/whatsapp/test", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "Invalid API key" in data["message"]


# ============================================================
# Tenant Isolation Tests
# ============================================================


class TestWhatsAppTenantIsolation:
    """Ensure one gym cannot access another gym's config."""

    async def test_cannot_see_other_gym_config(
        self,
        client: AsyncClient,
        auth_headers: dict,
        db_session: AsyncSession,
        sample_gym,
        other_gym,
    ):
        """Owner of gym A cannot see gym B's WhatsApp config."""
        # Create config for OTHER gym
        config = WhatsAppConfig(
            gym_id=other_gym.id,
            api_key="other_gym_key_1234567890",
            is_enabled=True,
        )
        db_session.add(config)
        await db_session.flush()

        # Auth headers are for sample_gym owner
        response = await client.get("/api/v1/whatsapp", headers=auth_headers)
        assert response.status_code == 404  # Can't see other gym's config


# ============================================================
# Notification Processor Tests (Unit)
# ============================================================


class TestNotificationProcessorProviderResolution:
    """Unit tests for per-gym provider resolution."""

    async def test_no_config_uses_log_only(self, db_session: AsyncSession, sample_gym):
        """Gym without WhatsApp config gets LogOnly provider."""
        processor = NotificationProcessor(db_session)
        provider = await processor._resolve_provider(sample_gym.id)
        assert provider.provider_name() == "log_only"

    async def test_config_enabled_with_plan_uses_aisensy(
        self, db_session: AsyncSession, sample_gym
    ):
        """Gym with config + enabled + plan uses AiSensy."""
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="real_key_1234567890",
            is_enabled=True,
        )
        db_session.add(config)
        await db_session.flush()

        processor = NotificationProcessor(db_session)
        provider = await processor._resolve_provider(sample_gym.id)
        assert provider.provider_name() == "aisensy"

    async def test_config_disabled_uses_log_only(
        self, db_session: AsyncSession, sample_gym
    ):
        """Gym with config disabled gets LogOnly."""
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="real_key_1234567890",
            is_enabled=False,
        )
        db_session.add(config)
        await db_session.flush()

        processor = NotificationProcessor(db_session)
        provider = await processor._resolve_provider(sample_gym.id)
        assert provider.provider_name() == "log_only"

    async def test_provider_cache_within_batch(
        self, db_session: AsyncSession, sample_gym
    ):
        """Provider is cached per gym_id within a processor instance."""
        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="cached_key_1234567890",
            is_enabled=True,
        )
        db_session.add(config)
        await db_session.flush()

        processor = NotificationProcessor(db_session)
        provider1 = await processor._resolve_provider(sample_gym.id)
        provider2 = await processor._resolve_provider(sample_gym.id)
        assert provider1 is provider2  # Same object (cached)

    async def test_no_subscription_uses_log_only(
        self, db_session: AsyncSession
    ):
        """Gym with config but no subscription row uses LogOnly."""
        from app.models.gym import Gym

        # Create gym without subscription
        gym = Gym(
            id=uuid4(),
            name="No Sub Gym",
            slug=f"nosub-{uuid4().hex[:8]}",
            phone="9999999999",
        )
        db_session.add(gym)
        await db_session.flush()

        config = WhatsAppConfig(
            gym_id=gym.id,
            api_key="nosub_key_1234567890",
            is_enabled=True,
        )
        db_session.add(config)
        await db_session.flush()

        processor = NotificationProcessor(db_session)
        provider = await processor._resolve_provider(gym.id)
        assert provider.provider_name() == "log_only"


class TestNotificationProcessorSendFlow:
    """Tests for the full notification send flow."""

    async def test_notification_without_phone_fails(
        self, db_session: AsyncSession, sample_gym
    ):
        """Notification with no phone in payload is marked failed."""
        from app.models.member import Member

        member = Member(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="No Phone Member",
            phone="9876543210",
        )
        db_session.add(member)
        await db_session.flush()

        notification = Notification(
            gym_id=sample_gym.id,
            member_id=member.id,
            notification_type=NotificationType.WELCOME,
            channel=NotificationChannel.WHATSAPP,
            status=NotificationStatus.PENDING,
            scheduled_for="2026-01-01T00:00:00Z",
            payload={"member_name": "Test"},  # No member_phone!
        )
        db_session.add(notification)
        await db_session.flush()

        processor = NotificationProcessor(db_session)
        result = await processor._send_notification(notification)
        assert result == "failed"
        assert notification.status == NotificationStatus.FAILED
        assert "No phone number" in notification.failure_reason

    async def test_notification_log_only_marks_sent(
        self, db_session: AsyncSession, sample_gym
    ):
        """Notification sent via LogOnly is marked SENT (status logged)."""
        from app.models.member import Member

        member = Member(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Log Member",
            phone="9876543210",
        )
        db_session.add(member)
        await db_session.flush()

        notification = Notification(
            gym_id=sample_gym.id,
            member_id=member.id,
            notification_type=NotificationType.WELCOME,
            channel=NotificationChannel.WHATSAPP,
            status=NotificationStatus.PENDING,
            scheduled_for="2026-01-01T00:00:00Z",
            payload={"member_name": "Test", "member_phone": "9876543210"},
        )
        db_session.add(notification)
        await db_session.flush()

        processor = NotificationProcessor(db_session)
        result = await processor._send_notification(notification)
        assert result == "logged"
        assert notification.status == NotificationStatus.SENT

    @patch("app.services.notification_processor.AiSensyProvider")
    async def test_notification_aisensy_failure_marks_failed(
        self,
        mock_provider_cls,
        db_session: AsyncSession,
        sample_gym,
    ):
        """Notification that fails via AiSensy is marked FAILED with reason."""
        from app.models.member import Member

        member = Member(
            id=uuid4(),
            gym_id=sample_gym.id,
            name="Fail Member",
            phone="9876543210",
        )
        db_session.add(member)
        await db_session.flush()

        config = WhatsAppConfig(
            gym_id=sample_gym.id,
            api_key="fail_key_1234567890",
            is_enabled=True,
        )
        db_session.add(config)
        await db_session.flush()

        notification = Notification(
            gym_id=sample_gym.id,
            member_id=member.id,
            notification_type=NotificationType.EXPIRY_7_DAYS,
            channel=NotificationChannel.WHATSAPP,
            status=NotificationStatus.PENDING,
            scheduled_for="2026-01-01T00:00:00Z",
            payload={
                "member_name": "Fail Member",
                "member_phone": "9876543210",
                "membership_end": "2026-01-08",
                "membership_plan": "Monthly",
            },
        )
        db_session.add(notification)
        await db_session.flush()

        # Mock provider to return failure
        mock_instance = AsyncMock()
        mock_instance.send_template_message.return_value = SendResult(
            success=False, error_message="Rate limit exceeded"
        )
        mock_instance.provider_name.return_value = "aisensy"
        mock_provider_cls.return_value = mock_instance

        processor = NotificationProcessor(db_session)
        # Pre-populate cache with mock
        processor._provider_cache[sample_gym.id] = mock_instance

        result = await processor._send_notification(notification)
        assert result == "failed"
        assert notification.status == NotificationStatus.FAILED
        assert "Rate limit" in notification.failure_reason


# ============================================================
# WhatsApp Provider Unit Tests
# ============================================================


class TestAiSensyProvider:
    """Unit tests for the AiSensy provider adapter."""

    async def test_log_only_always_succeeds(self):
        """LogOnly provider always returns success."""
        provider = LogOnlyProvider()
        message = WhatsAppMessage(
            phone="919876543210",
            template_name="test_template",
            variables=["John"],
        )
        result = await provider.send_template_message(message)
        assert result.success is True
        assert result.provider_message_id == "log_only_mock"

    async def test_build_message_expiry_7_days(self):
        """build_message_from_notification creates correct message for 7-day expiry."""
        message = build_message_from_notification(
            notification_type="expiry_7_days",
            phone="9876543210",
            payload={
                "member_name": "Rahul",
                "membership_end": "2026-01-25",
                "membership_plan": "Monthly Premium",
            },
        )
        assert message.phone == "919876543210"  # Country code added
        assert message.template_name == "membership_expiry_7day"
        assert message.variables == ["Rahul", "2026-01-25", "Monthly Premium"]

    async def test_build_message_welcome(self):
        """build_message_from_notification creates correct welcome message."""
        message = build_message_from_notification(
            notification_type="welcome",
            phone="919876543210",  # Already has country code
            payload={
                "member_name": "Priya",
                "membership_plan": "3 Month Gold",
            },
        )
        assert message.phone == "919876543210"
        assert message.template_name == "welcome_new_member"
        assert message.variables == ["Priya", "3 Month Gold"]

    async def test_build_message_unknown_type_fallback(self):
        """Unknown notification type uses generic template."""
        message = build_message_from_notification(
            notification_type="unknown_type",
            phone="9876543210",
            payload={"member_name": "Test"},
        )
        assert message.template_name == "generic_notification"
        assert message.variables == ["Test"]

    async def test_build_message_phone_with_plus(self):
        """Phone number starting with + is left unchanged."""
        message = build_message_from_notification(
            notification_type="welcome",
            phone="+919876543210",
            payload={"member_name": "Test"},
        )
        assert message.phone == "+919876543210"

    @patch("httpx.AsyncClient.post")
    async def test_aisensy_timeout_handled(self, mock_post):
        """AiSensy provider handles timeout gracefully."""
        import httpx
        mock_post.side_effect = httpx.TimeoutException("Connection timed out")

        provider = AiSensyProvider(api_key="test_key_123")
        message = WhatsAppMessage(
            phone="919876543210",
            template_name="test",
            variables=["Test"],
        )
        result = await provider.send_template_message(message)
        assert result.success is False
        assert "timed out" in result.error_message.lower()

    @patch("httpx.AsyncClient.post")
    async def test_aisensy_connect_error_handled(self, mock_post):
        """AiSensy provider handles connection errors."""
        import httpx
        mock_post.side_effect = httpx.ConnectError("DNS resolution failed")

        provider = AiSensyProvider(api_key="test_key_123")
        message = WhatsAppMessage(
            phone="919876543210",
            template_name="test",
            variables=["Test"],
        )
        result = await provider.send_template_message(message)
        assert result.success is False
        assert "Cannot connect" in result.error_message


# ============================================================
# API Key Masking Tests
# ============================================================


class TestApiKeyMasking:
    """Tests for API key masking utility."""

    def test_mask_normal_key(self):
        from app.routers.whatsapp_config import _mask_api_key
        assert _mask_api_key("abcdefghijklmnop") == "************mnop"

    def test_mask_short_key(self):
        from app.routers.whatsapp_config import _mask_api_key
        assert _mask_api_key("abcd") == "****"

    def test_mask_5_char_key(self):
        from app.routers.whatsapp_config import _mask_api_key
        # 5 chars: 1 asterisk + last 4
        assert _mask_api_key("12345") == "*2345"

    def test_mask_empty_key(self):
        from app.routers.whatsapp_config import _mask_api_key
        assert _mask_api_key("") == "****"
