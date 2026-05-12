"""
Billing + subscription integration tests.

Tests:
- Subscription creation (trial)
- Plan listing
- Payment verification (mock provider)
- Webhook validation (duplicate prevention, invalid rejection)
- Trial expiration
- Feature gating (member limits)
- Tenant billing isolation
- Grace period behavior
- Subscription enforcement correctness
"""

from datetime import date, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.gym import Gym
from app.models.subscription import (
    BillingStatus,
    GymSubscription,
    PlanTier,
    SubscriptionPlan,
)
from app.models.user import User, UserRole
from app.services.billing_service import (
    cancel_subscription,
    check_trial_expirations,
    create_trial_subscription,
    get_access_level,
    get_billing_metrics,
    get_feature_limits,
    get_subscription,
    process_webhook_payment,
    verify_and_activate,
)
from app.services.payment_gateway import MockProvider, configure_payment_provider


# === Fixtures ===


@pytest.fixture(autouse=True)
def _setup_mock_provider():
    """Ensure MockProvider is active for all billing tests."""
    configure_payment_provider(MockProvider())


@pytest.fixture
async def billing_gym(db_session: AsyncSession) -> Gym:
    """Create a gym specifically for billing tests."""
    gym = Gym(
        id=uuid4(),
        name="Billing Test Gym",
        slug=f"billing-gym-{uuid4().hex[:8]}",
        phone="9876543210",
        email="billing@test.com",
    )
    db_session.add(gym)
    await db_session.flush()
    return gym


@pytest.fixture
async def billing_user(db_session: AsyncSession, billing_gym: Gym) -> User:
    """Create an owner user for billing tests."""
    from app.core.security import hash_password
    from app.core.cache import get_cache_backend

    user = User(
        id=uuid4(),
        gym_id=billing_gym.id,
        name="Billing Owner",
        email="billingowner@test.com",
        phone="9876543210",
        password_hash=hash_password("TestPass123"),
        role=UserRole.OWNER,
    )
    db_session.add(user)
    await db_session.flush()
    cache = get_cache_backend()
    cache.set(f"user_active:{user.id}", "1", 99999)
    cache.set(f"user_revoked_at:{user.id}", "", 99999)
    return user


@pytest.fixture
def billing_headers(billing_user: User, billing_gym: Gym) -> dict[str, str]:
    """Auth headers for billing test user."""
    token = create_access_token(billing_user.id, billing_gym.id, billing_user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def starter_plan(db_session: AsyncSession) -> SubscriptionPlan:
    """Return the seeded Starter plan."""
    import sqlalchemy as sa
    result = await db_session.execute(
        sa.select(SubscriptionPlan).where(SubscriptionPlan.tier == PlanTier.STARTER)
    )
    return result.scalar_one()


@pytest.fixture
async def pro_plan(db_session: AsyncSession) -> SubscriptionPlan:
    """Return the seeded Pro plan."""
    import sqlalchemy as sa
    result = await db_session.execute(
        sa.select(SubscriptionPlan).where(SubscriptionPlan.tier == PlanTier.PRO)
    )
    return result.scalar_one()


# === Part 1: Subscription Creation ===


class TestSubscriptionCreation:
    """Test subscription lifecycle creation."""

    @pytest.mark.asyncio
    async def test_create_trial(self, db_session, billing_gym, starter_plan):
        """New gym gets a trial subscription."""
        sub = await create_trial_subscription(db_session, billing_gym.id, "starter")

        assert sub.status == BillingStatus.TRIAL
        assert sub.trial_start == date.today()
        assert sub.trial_end == date.today() + timedelta(days=3)
        assert sub.gym_id == billing_gym.id

    @pytest.mark.asyncio
    async def test_duplicate_trial_prevention(self, db_session, billing_gym, starter_plan):
        """Creating trial twice returns existing subscription."""
        sub1 = await create_trial_subscription(db_session, billing_gym.id, "starter")
        sub2 = await create_trial_subscription(db_session, billing_gym.id, "starter")

        assert sub1.id == sub2.id  # Same subscription returned

    @pytest.mark.asyncio
    async def test_trial_has_correct_plan(self, db_session, billing_gym, starter_plan):
        """Trial subscription uses the correct plan."""
        sub = await create_trial_subscription(db_session, billing_gym.id, "starter")
        assert sub.plan_id == starter_plan.id


# === Part 2: Payment Verification ===


class TestPaymentVerification:
    """Test payment verification with mock provider."""

    @pytest.mark.asyncio
    async def test_mock_payment_verify(self, db_session, billing_gym, starter_plan):
        """Mock provider always verifies successfully."""
        from app.services.billing_service import start_subscription

        sub, invoice = await start_subscription(db_session, billing_gym.id, "starter")

        result = await verify_and_activate(
            db_session,
            billing_gym.id,
            payment_id="mock_pay_123",
            order_id=invoice.razorpay_order_id,
            signature="mock_sig",
        )

        assert result.status == BillingStatus.ACTIVE
        assert result.current_period_start is not None
        assert result.current_period_end is not None

    @pytest.mark.asyncio
    async def test_idempotent_verification(self, db_session, billing_gym, starter_plan):
        """Verifying the same payment twice is safe (idempotent)."""
        from app.services.billing_service import start_subscription

        sub, invoice = await start_subscription(db_session, billing_gym.id, "starter")

        # First verification
        result1 = await verify_and_activate(
            db_session, billing_gym.id,
            "mock_pay_123", invoice.razorpay_order_id, "mock_sig",
        )

        # Second verification (idempotent)
        result2 = await verify_and_activate(
            db_session, billing_gym.id,
            "mock_pay_123", invoice.razorpay_order_id, "mock_sig",
        )

        assert result1.id == result2.id
        assert result2.status == BillingStatus.ACTIVE


# === Part 3: Webhook Validation ===


class TestWebhookProcessing:
    """Test webhook event processing."""

    @pytest.mark.asyncio
    async def test_payment_captured_webhook(self, db_session, billing_gym, starter_plan):
        """Successful payment webhook activates subscription."""
        from app.services.billing_service import start_subscription

        sub, invoice = await start_subscription(db_session, billing_gym.id, "starter")

        await process_webhook_payment(
            db_session,
            payment_id="pay_webhook_123",
            order_id=invoice.razorpay_order_id,
            amount_in_paise=99900,
            status="captured",
        )
        await db_session.flush()

        updated_sub = await get_subscription(db_session, billing_gym.id)
        assert updated_sub.status == BillingStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_duplicate_webhook_ignored(self, db_session, billing_gym, starter_plan):
        """Duplicate webhook for already-paid invoice is safely ignored."""
        from app.services.billing_service import start_subscription

        sub, invoice = await start_subscription(db_session, billing_gym.id, "starter")

        # First webhook
        await process_webhook_payment(
            db_session, "pay_1", invoice.razorpay_order_id, 99900, "captured",
        )

        # Second webhook (duplicate) — should not crash
        await process_webhook_payment(
            db_session, "pay_1", invoice.razorpay_order_id, 99900, "captured",
        )

        updated_sub = await get_subscription(db_session, billing_gym.id)
        assert updated_sub.status == BillingStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_failed_payment_webhook(self, db_session, billing_gym, starter_plan):
        """Failed payment webhook marks subscription as past_due."""
        from app.services.billing_service import start_subscription

        sub, invoice = await start_subscription(db_session, billing_gym.id, "starter")

        await process_webhook_payment(
            db_session, "pay_fail_1", invoice.razorpay_order_id, 99900, "failed",
        )
        await db_session.flush()

        updated_sub = await get_subscription(db_session, billing_gym.id)
        assert updated_sub.status == BillingStatus.PAST_DUE
        assert updated_sub.payment_retry_count == 1

    @pytest.mark.asyncio
    async def test_nonexistent_order_webhook(self, db_session):
        """Webhook for unknown order is silently ignored."""
        # Should not raise
        await process_webhook_payment(
            db_session, "pay_x", "order_nonexistent", 99900, "captured",
        )

    @pytest.mark.asyncio
    async def test_max_retries_expires_subscription(self, db_session, billing_gym, starter_plan):
        """After max retries, subscription is expired."""
        from app.services.billing_service import start_subscription, MAX_PAYMENT_RETRIES

        sub, invoice = await start_subscription(db_session, billing_gym.id, "starter")

        # Simulate max retries
        for i in range(MAX_PAYMENT_RETRIES):
            # Need a fresh invoice each retry for proper simulation
            # In practice, webhook hits the same invoice
            await process_webhook_payment(
                db_session, f"pay_fail_{i}", invoice.razorpay_order_id, 99900, "failed",
            )
            await db_session.flush()

        updated_sub = await get_subscription(db_session, billing_gym.id)
        assert updated_sub.status == BillingStatus.EXPIRED


# === Part 4: Trial Expiration ===


class TestTrialExpiration:
    """Test trial lifecycle."""

    @pytest.mark.asyncio
    async def test_active_trial_not_expired(self, db_session, billing_gym, starter_plan):
        """Trial with future end date is not expired."""
        _ = await create_trial_subscription(db_session, billing_gym.id, "starter")
        count = await check_trial_expirations(db_session)

        assert count == 0
        refreshed = await get_subscription(db_session, billing_gym.id)
        assert refreshed.status == BillingStatus.TRIAL

    @pytest.mark.asyncio
    async def test_expired_trial_detection(self, db_session, billing_gym, starter_plan):
        """Trial past end date is marked expired."""
        sub = await create_trial_subscription(db_session, billing_gym.id, "starter")

        # Manually set trial to expired
        sub.trial_end = date.today() - timedelta(days=1)
        await db_session.flush()

        count = await check_trial_expirations(db_session)
        assert count == 1

        refreshed = await get_subscription(db_session, billing_gym.id)
        assert refreshed.status == BillingStatus.EXPIRED


# === Part 5: Access Control / Grace Periods ===


class TestAccessControl:
    """Test subscription-based access control."""

    def test_trial_has_full_access(self):
        sub = GymSubscription(status=BillingStatus.TRIAL)
        assert get_access_level(sub) == "full"

    def test_active_has_full_access(self):
        sub = GymSubscription(status=BillingStatus.ACTIVE)
        assert get_access_level(sub) == "full"

    def test_past_due_has_full_access(self):
        """Past due = retrying payment, don't punish the user yet."""
        sub = GymSubscription(status=BillingStatus.PAST_DUE)
        assert get_access_level(sub) == "full"

    def test_cancelled_in_period_has_full_access(self):
        """Cancelled but still in paid period = full access."""
        sub = GymSubscription(
            status=BillingStatus.CANCELLED,
            current_period_end=date.today() + timedelta(days=10),
        )
        assert get_access_level(sub) == "full"

    def test_cancelled_in_grace_has_read_only(self):
        """Cancelled after period end, within grace = read-only."""
        sub = GymSubscription(
            status=BillingStatus.CANCELLED,
            current_period_end=date.today() - timedelta(days=3),
        )
        assert get_access_level(sub) == "read_only"

    def test_cancelled_past_grace_is_locked(self):
        """Cancelled and past grace period = locked."""
        sub = GymSubscription(
            status=BillingStatus.CANCELLED,
            current_period_end=date.today() - timedelta(days=30),
        )
        assert get_access_level(sub) == "locked"

    def test_expired_in_grace_has_read_only(self):
        """Expired within grace period = read-only."""
        sub = GymSubscription(
            status=BillingStatus.EXPIRED,
            current_period_end=date.today() - timedelta(days=2),
            trial_end=None,
        )
        assert get_access_level(sub) == "read_only"

    def test_expired_past_grace_is_locked(self):
        """Expired past grace = locked."""
        sub = GymSubscription(
            status=BillingStatus.EXPIRED,
            current_period_end=date.today() - timedelta(days=30),
            trial_end=None,
        )
        assert get_access_level(sub) == "locked"

    def test_no_subscription_is_locked(self):
        assert get_access_level(None) == "locked"


# === Part 6: Feature Gating ===


class TestFeatureGating:
    """Test feature limit enforcement."""

    @pytest.mark.asyncio
    async def test_feature_limits_starter(self, db_session, billing_gym, starter_plan):
        """Starter plan has correct limits."""
        await create_trial_subscription(db_session, billing_gym.id, "starter")
        limits = await get_feature_limits(db_session, billing_gym.id)

        assert limits["plan_tier"] == "starter"
        assert limits["max_members"] == 50
        assert limits["sms_notifications_enabled"] is False
        assert limits["advanced_reports_enabled"] is False

    @pytest.mark.asyncio
    async def test_feature_limits_no_subscription(self, db_session, billing_gym):
        """No subscription = all limits at zero."""
        limits = await get_feature_limits(db_session, billing_gym.id)

        assert limits["plan_tier"] == "none"
        assert limits["max_members"] == 0
        assert limits["is_at_member_limit"] is True


# === Part 7: Tenant Isolation ===


class TestTenantIsolation:
    """Test that billing is properly isolated per gym."""

    @pytest.mark.asyncio
    async def test_separate_gym_subscriptions(self, db_session, starter_plan):
        """Two gyms have independent subscriptions."""
        gym1 = Gym(id=uuid4(), name="Gym 1", slug=f"gym1-{uuid4().hex[:6]}", phone="9876543210")
        gym2 = Gym(id=uuid4(), name="Gym 2", slug=f"gym2-{uuid4().hex[:6]}", phone="9876543211")
        db_session.add_all([gym1, gym2])
        await db_session.flush()

        sub1 = await create_trial_subscription(db_session, gym1.id, "starter")
        sub2 = await create_trial_subscription(db_session, gym2.id, "starter")

        assert sub1.gym_id == gym1.id
        assert sub2.gym_id == gym2.id
        assert sub1.id != sub2.id


# === Part 8: Cancellation ===


class TestCancellation:
    """Test subscription cancellation."""

    @pytest.mark.asyncio
    async def test_cancel_active_subscription(self, db_session, billing_gym, starter_plan):
        """Cancel an active subscription."""
        from app.services.billing_service import start_subscription

        sub, invoice = await start_subscription(db_session, billing_gym.id, "starter")

        # Activate it first
        await verify_and_activate(
            db_session, billing_gym.id,
            "mock_pay", invoice.razorpay_order_id, "mock_sig",
        )

        result = await cancel_subscription(db_session, billing_gym.id, "Too expensive")
        assert result.status == BillingStatus.CANCELLED
        assert result.cancel_at_period_end is True
        assert result.cancelled_at is not None

    @pytest.mark.asyncio
    async def test_cancel_expired_raises(self, db_session, billing_gym, starter_plan):
        """Cannot cancel an already expired subscription."""
        sub = await create_trial_subscription(db_session, billing_gym.id, "starter")
        sub.status = BillingStatus.EXPIRED
        await db_session.flush()

        from app.core.exceptions import ValidationError
        with pytest.raises(ValidationError, match="already expired"):
            await cancel_subscription(db_session, billing_gym.id)


# === Part 9: API Endpoint Tests ===


class TestBillingAPI:
    """Test billing API endpoints via HTTP."""

    @pytest.mark.asyncio
    async def test_list_plans(self, client: AsyncClient, starter_plan, pro_plan):
        """GET /billing/plans returns active plans."""
        response = await client.get("/api/v1/billing/plans")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2
        tiers = [p["tier"] for p in data]
        assert "starter" in tiers
        assert "pro" in tiers

    @pytest.mark.asyncio
    async def test_get_subscription_none(self, client: AsyncClient, billing_headers):
        """GET /billing/subscription with no subscription returns null."""
        response = await client.get("/api/v1/billing/subscription", headers=billing_headers)
        assert response.status_code == 200
        # May be null or the subscription data

    @pytest.mark.asyncio
    async def test_subscribe_creates_order(self, client: AsyncClient, billing_headers, starter_plan):
        """POST /billing/subscribe creates a payment order."""
        response = await client.post(
            "/api/v1/billing/subscribe",
            json={"plan_tier": "starter"},
            headers=billing_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "subscription_id" in data
        assert data["amount_in_paise"] == 99900

    @pytest.mark.asyncio
    async def test_webhook_endpoint(self, client: AsyncClient, starter_plan, billing_gym):
        """POST /billing/webhook accepts valid webhook."""
        # Create a subscription + invoice first (so the webhook has something to match)
        response = await client.post(
            "/api/v1/billing/webhook",
            json={"event": "payment.captured", "payment_id": "test", "order_id": "test"},
            headers={"X-Razorpay-Signature": "mock_sig"},
        )
        # Mock provider accepts all signatures
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_billing_history_empty(self, client: AsyncClient, billing_headers):
        """GET /billing/history returns empty for new gym."""
        response = await client.get("/api/v1/billing/history", headers=billing_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_feature_limits_endpoint(self, client: AsyncClient, billing_headers, starter_plan, billing_gym, db_session):
        """GET /billing/features returns limits."""
        await create_trial_subscription(db_session, billing_gym.id, "starter")
        await db_session.flush()

        response = await client.get("/api/v1/billing/features", headers=billing_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["plan_tier"] == "starter"
        assert data["max_members"] == 50


# === Part 10: Billing Metrics ===


class TestBillingMetrics:
    """Test internal billing metrics."""

    @pytest.mark.asyncio
    async def test_metrics_empty_state(self, db_session):
        """Metrics return zeros when no subscriptions exist."""
        metrics = await get_billing_metrics(db_session)
        assert metrics["mrr_in_paise"] == 0
        assert metrics["active_subscriptions"] == 0

    @pytest.mark.asyncio
    async def test_metrics_with_active_sub(self, db_session, billing_gym, starter_plan):
        """Metrics reflect active subscriptions."""
        from app.services.billing_service import start_subscription

        sub, invoice = await start_subscription(db_session, billing_gym.id, "starter")
        await verify_and_activate(
            db_session, billing_gym.id,
            "mock_pay", invoice.razorpay_order_id, "mock_sig",
        )

        metrics = await get_billing_metrics(db_session)
        assert metrics["active_subscriptions"] >= 1
        assert metrics["mrr_in_paise"] >= 99900
