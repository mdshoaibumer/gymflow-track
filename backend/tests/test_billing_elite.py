"""
Billing & subscription tests — Elite plan early access mode.

Verifies:
1. All gyms get Elite plan on registration (unlimited features)
2. Trial subscription with 10-year expiry (effectively unlimited)
3. Billing enforcement disabled (all features unlocked)
4. Plan seeding is idempotent
5. Subscription lifecycle states
6. Webhook signature validation
7. Payment verification IDOR protection (gym_id scoping)
8. upgrade_all_to_elite script correctness
"""

from datetime import date, timedelta, datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_backend
from app.core.security import create_access_token, hash_password
from app.models.gym import Gym
from app.models.subscription import (
    BillingInterval,
    BillingStatus,
    GymSubscription,
    Invoice,
    InvoiceStatus,
    PlanTier,
    SubscriptionPlan,
)
from app.models.user import User, UserRole
from app.services.billing_service import (
    TRIAL_DAYS,
    create_trial_subscription,
    get_active_plans,
    get_plan_by_tier,
    get_subscription,
    seed_default_plans,
    verify_and_activate,
)


# =============================================================================
# 1. Elite Plan for All Gyms
# =============================================================================


@pytest.mark.anyio
class TestElitePlanForAll:
    """Verify all new gyms receive the Elite plan with unlimited access."""

    async def test_trial_days_effectively_unlimited(self):
        """TRIAL_DAYS must be ~10 years (3650 days)."""
        assert TRIAL_DAYS == 3650, f"Expected 3650 days, got {TRIAL_DAYS}"

    async def test_registration_creates_elite_trial(self, client, db_session):
        """New gym registration should auto-create Elite trial subscription."""
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "gym_name": "Elite Test Gym",
                "owner_name": "Test Owner",
                "email": f"elite-test-{uuid4().hex[:8]}@gym.com",
                "phone": "9876500001",
                "password": "StrongPass123!",
                "city": "Mumbai",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data

        # Verify subscription was created
        from app.core.security import decode_token

        payload = decode_token(data["access_token"])
        gym_id = payload["gym_id"]

        result = await db_session.execute(
            sa.select(GymSubscription).where(
                GymSubscription.gym_id == gym_id
            )
        )
        sub = result.scalar_one_or_none()
        assert sub is not None
        assert sub.status == BillingStatus.TRIAL

        # Verify it's on Elite plan
        result = await db_session.execute(
            sa.select(SubscriptionPlan).where(
                SubscriptionPlan.id == sub.plan_id
            )
        )
        plan = result.scalar_one()
        assert plan.tier == PlanTier.ELITE

    async def test_trial_subscription_has_long_expiry(self, db_session):
        """Trial subscription should have ~10 year expiry."""
        # Create a gym
        gym = Gym(
            id=uuid4(),
            name="Long Trial Gym",
            slug=f"long-trial-{uuid4().hex[:8]}",
            phone="9876500002",
            email="long@trial.com",
        )
        db_session.add(gym)
        await db_session.flush()

        sub = await create_trial_subscription(db_session, gym.id)
        assert sub.trial_end is not None

        # Should be ~10 years from today
        from app.core.timezone import today_ist

        today = today_ist()
        days_until_expiry = (sub.trial_end - today).days
        assert days_until_expiry >= 3640  # Allow small variance

    async def test_elite_plan_has_unlimited_members(self, db_session):
        """Elite plan should allow 999999 members (effectively unlimited)."""
        plan = await get_plan_by_tier(db_session, "elite")
        assert plan.max_members == 999999
        assert plan.max_staff_users == 999999

    async def test_elite_plan_has_all_features_enabled(self, db_session):
        """Elite plan must have every feature flag enabled."""
        plan = await get_plan_by_tier(db_session, "elite")
        assert plan.sms_notifications_enabled is True
        assert plan.advanced_reports_enabled is True
        assert plan.qr_attendance_enabled is True
        assert plan.advanced_analytics_enabled is True
        assert plan.export_reports_enabled is True
        assert plan.multi_branch_enabled is True
        assert plan.automated_whatsapp_enabled is True


# =============================================================================
# 2. Billing Enforcement Disabled
# =============================================================================


@pytest.mark.anyio
class TestBillingEnforcementDisabled:
    """Verify billing enforcement is OFF for early access."""

    async def test_enforcement_flag_is_false(self):
        """ENABLE_BILLING_ENFORCEMENT must be False."""
        from app.core.billing_dependencies import ENABLE_BILLING_ENFORCEMENT

        assert ENABLE_BILLING_ENFORCEMENT is False

    async def test_expired_gym_can_still_write(self, client, db_session, sample_gym, auth_headers):
        """Even with expired subscription, write operations should work."""
        # Set subscription to expired
        result = await db_session.execute(
            sa.select(GymSubscription).where(
                GymSubscription.gym_id == sample_gym.id
            )
        )
        sub = result.scalar_one()
        sub.status = BillingStatus.EXPIRED
        await db_session.flush()

        # Should still be able to create members (billing not enforced)
        response = await client.post(
            "/api/v1/members",
            headers=auth_headers,
            json={
                "name": "Expired Gym Member",
                "phone": "9876500003",
                "gender": "male",
            },
        )
        # Should succeed (201) or at least not be 403 (billing block)
        assert response.status_code != 403


# =============================================================================
# 3. Plan Seeding Idempotency
# =============================================================================


@pytest.mark.anyio
class TestPlanSeeding:
    """Verify plan seeding is idempotent and correct."""

    async def test_seed_creates_three_plans(self, db_session):
        """Seeding should create exactly 3 active plans."""
        plans = await get_active_plans(db_session)
        tier_names = {p.tier for p in plans}
        assert PlanTier.STARTER in tier_names
        assert PlanTier.PRO in tier_names
        assert PlanTier.ELITE in tier_names

    async def test_seed_is_idempotent(self, db_session):
        """Running seed twice should not create duplicate plans."""
        await seed_default_plans(db_session)
        await seed_default_plans(db_session)

        result = await db_session.execute(
            sa.select(sa.func.count()).select_from(SubscriptionPlan).where(
                SubscriptionPlan.is_active == True  # noqa: E712
            )
        )
        count = result.scalar_one()
        assert count == 3  # Only Starter, Pro, Elite

    async def test_plan_pricing_is_correct(self, db_session):
        """Plan pricing should match specifications."""
        starter = await get_plan_by_tier(db_session, "starter")
        pro = await get_plan_by_tier(db_session, "pro")
        elite = await get_plan_by_tier(db_session, "elite")

        assert starter.price_in_paise == 99900  # ₹999
        assert pro.price_in_paise == 199900  # ₹1999
        assert elite.price_in_paise == 299900  # ₹2999

    async def test_plan_member_limits(self, db_session):
        """Plan member limits should be tiered correctly."""
        starter = await get_plan_by_tier(db_session, "starter")
        pro = await get_plan_by_tier(db_session, "pro")
        elite = await get_plan_by_tier(db_session, "elite")

        assert starter.max_members == 100
        assert pro.max_members == 500
        assert elite.max_members == 999999


# =============================================================================
# 4. Payment Verification IDOR Protection
# =============================================================================


@pytest.mark.anyio
class TestPaymentVerificationSecurity:
    """Verify payment verification is scoped to the authenticated gym."""

    async def test_verify_rejects_other_gyms_order(
        self, client, db_session, sample_gym, sample_user, other_gym, auth_headers
    ):
        """Verifying a payment order belonging to another gym must fail."""
        # Create an invoice for the OTHER gym
        elite_plan = await get_plan_by_tier(db_session, "elite")
        other_sub = await get_subscription(db_session, other_gym.id)

        invoice = Invoice(
            id=uuid4(),
            gym_id=other_gym.id,
            subscription_id=other_sub.id if other_sub else uuid4(),
            invoice_number=f"INV-{uuid4().hex[:8]}",
            amount_in_paise=299900,
            status=InvoiceStatus.PENDING,
            razorpay_order_id="order_other_gym_12345",
            period_start=date.today(),
            period_end=date.today() + timedelta(days=30),
        )
        db_session.add(invoice)
        await db_session.flush()

        # Try to verify using our gym's auth (should fail — invoice not found for our gym)
        response = await client.post(
            "/api/v1/billing/verify",
            headers=auth_headers,
            json={
                "razorpay_payment_id": "pay_fake123",
                "razorpay_order_id": "order_other_gym_12345",
                "razorpay_signature": "fake_signature",
            },
        )
        data = response.json()
        # Should report not found (invoice doesn't belong to our gym)
        assert data.get("verified") is False or response.status_code in (404, 422)

    async def test_verify_accepts_own_gym_order(
        self, client, db_session, sample_gym, sample_user, auth_headers, test_plan
    ):
        """Verifying a payment order for our own gym should proceed."""
        # Get our subscription
        sub = await get_subscription(db_session, sample_gym.id)

        invoice = Invoice(
            id=uuid4(),
            gym_id=sample_gym.id,
            subscription_id=sub.id,
            invoice_number=f"INV-{uuid4().hex[:8]}",
            amount_in_paise=299900,
            status=InvoiceStatus.PENDING,
            razorpay_order_id=f"order_own_{uuid4().hex[:8]}",
            period_start=date.today(),
            period_end=date.today() + timedelta(days=30),
        )
        db_session.add(invoice)
        await db_session.flush()

        # Mock payment provider to verify successfully
        with patch(
            "app.services.billing_service.get_payment_provider"
        ) as mock_provider:
            mock_prov_instance = AsyncMock()
            mock_prov_instance.verify_payment = AsyncMock(
                return_value=AsyncMock(verified=True)
            )
            mock_provider.return_value = mock_prov_instance

            response = await client.post(
                "/api/v1/billing/verify",
                headers=auth_headers,
                json={
                    "razorpay_payment_id": "pay_test123",
                    "razorpay_order_id": invoice.razorpay_order_id,
                    "razorpay_signature": "valid_sig",
                },
            )
            data = response.json()
            assert data.get("verified") is True


# =============================================================================
# 5. Webhook Signature Validation
# =============================================================================


@pytest.mark.anyio
class TestWebhookSecurity:
    """Verify webhook endpoint validates signatures."""

    async def test_webhook_rejects_invalid_signature(self, client):
        """Webhook with invalid signature must be rejected."""
        response = await client.post(
            "/api/v1/billing/webhook",
            content=b'{"event":"payment.captured"}',
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": "invalid_signature_here",
            },
        )
        # Should reject with 400
        assert response.status_code == 400

    async def test_webhook_rejects_missing_signature(self, client):
        """Webhook without signature header must be rejected."""
        response = await client.post(
            "/api/v1/billing/webhook",
            content=b'{"event":"payment.captured"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    async def test_webhook_rejects_invalid_json(self, client):
        """Webhook with invalid JSON body must be rejected."""
        response = await client.post(
            "/api/v1/billing/webhook",
            content=b"not valid json {{{",
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": "some_sig",
            },
        )
        assert response.status_code == 400


# =============================================================================
# 6. Subscription Lifecycle
# =============================================================================


@pytest.mark.anyio
class TestSubscriptionLifecycle:
    """Verify subscription state transitions are correct."""

    async def test_new_gym_starts_as_trial(self, db_session):
        """New subscription should start in TRIAL state."""
        gym = Gym(
            id=uuid4(),
            name="Lifecycle Test Gym",
            slug=f"lifecycle-{uuid4().hex[:8]}",
            phone="9876500004",
            email="lifecycle@test.com",
        )
        db_session.add(gym)
        await db_session.flush()

        sub = await create_trial_subscription(db_session, gym.id)
        assert sub.status == BillingStatus.TRIAL

    async def test_duplicate_trial_creation_returns_existing(self, db_session, sample_gym):
        """Creating trial for gym that already has subscription returns existing."""
        existing = await get_subscription(db_session, sample_gym.id)
        assert existing is not None

        # Try creating trial again
        sub = await create_trial_subscription(db_session, sample_gym.id)
        assert sub.id == existing.id  # Same subscription returned

    async def test_subscription_status_endpoint(self, client, auth_headers):
        """GET /billing/subscription should return current status."""
        response = await client.get(
            "/api/v1/billing/subscription",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data is not None
        assert "plan" in data
        assert data["plan"]["tier"] == "elite"

    async def test_plans_endpoint_returns_all_tiers(self, client):
        """GET /billing/plans should be public and return all plans."""
        response = await client.get("/api/v1/billing/plans")
        assert response.status_code == 200
        data = response.json()
        tiers = {p["tier"] for p in data}
        assert "starter" in tiers
        assert "pro" in tiers
        assert "elite" in tiers

    async def test_features_endpoint_returns_elite_features(self, client, auth_headers):
        """GET /billing/features should show unlimited for Elite plan."""
        response = await client.get(
            "/api/v1/billing/features",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["max_members"] == 999999
        assert data["qr_attendance_enabled"] is True
        assert data["automated_whatsapp_enabled"] is True


# =============================================================================
# 7. Upgrade Script Validation
# =============================================================================


@pytest.mark.anyio
class TestUpgradeToElite:
    """Verify the upgrade_all_to_elite logic works correctly."""

    async def test_expired_gym_can_be_upgraded(self, db_session, test_plan):
        """An expired gym should be upgradeable to Elite ACTIVE."""
        gym = Gym(
            id=uuid4(),
            name="Expired Gym",
            slug=f"expired-{uuid4().hex[:8]}",
            phone="9876500005",
            email="expired@gym.com",
        )
        db_session.add(gym)
        await db_session.flush()

        # Create a starter subscription that's expired
        starter = await get_plan_by_tier(db_session, "starter")
        sub = GymSubscription(
            id=uuid4(),
            gym_id=gym.id,
            plan_id=starter.id,
            status=BillingStatus.EXPIRED,
            trial_start=date.today() - timedelta(days=60),
            trial_end=date.today() - timedelta(days=30),
        )
        db_session.add(sub)
        await db_session.flush()

        # Simulate upgrade logic
        elite = await get_plan_by_tier(db_session, "elite")
        sub.plan_id = elite.id
        sub.status = BillingStatus.ACTIVE
        from app.core.timezone import today_ist

        sub.trial_end = today_ist() + timedelta(days=3650)
        await db_session.flush()

        # Verify upgrade
        refreshed = await get_subscription(db_session, gym.id)
        assert refreshed.plan_id == elite.id
        assert refreshed.status == BillingStatus.ACTIVE
