"""
Tests for app.services.payment_gateway — payment provider abstraction.

Coverage:
1. MockProvider — create_order, verify_payment, verify_webhook_signature, parse_webhook
2. RazorpayProvider — signature verification logic (no real HTTP)
3. PaymentProviderError exception
4. OrderResult, VerificationResult, WebhookEvent dataclasses
"""

import asyncio
import hashlib
import hmac

import pytest  # noqa: F401

from app.services.payment_gateway import (
    MockProvider,
    OrderResult,
    PaymentProviderError,
    RazorpayProvider,
    VerificationResult,
    WebhookEvent,
)


def _run(coro):
    """Helper to run an async function synchronously in tests."""
    return asyncio.run(coro)


class TestMockProvider:
    """Mock provider for testing — all operations succeed."""

    def test_create_order_returns_result(self):
        provider = MockProvider()
        result = _run(provider.create_order(
            amount_in_paise=50000,
            currency="INR",
            receipt="inv_123",
        ))
        assert isinstance(result, OrderResult)
        assert result.amount_in_paise == 50000
        assert result.currency == "INR"
        assert result.provider == "mock"
        assert result.order_id.startswith("mock_order_")

    def test_create_order_with_notes(self):
        provider = MockProvider()
        result = _run(provider.create_order(
            amount_in_paise=100000,
            currency="INR",
            receipt="inv_456",
            notes={"gym_id": "abc", "plan": "pro"},
        ))
        assert result.amount_in_paise == 100000

    def test_verify_payment_always_succeeds(self):
        provider = MockProvider()
        result = _run(provider.verify_payment(
            payment_id="pay_test_123",
            order_id="order_test_456",
            signature="fake_signature",
        ))
        assert isinstance(result, VerificationResult)
        assert result.verified is True
        assert result.payment_id == "pay_test_123"
        assert result.order_id == "order_test_456"

    def test_verify_webhook_always_valid(self):
        provider = MockProvider()
        assert provider.verify_webhook_signature(b"body", "sig") is True

    def test_parse_webhook(self):
        provider = MockProvider()
        payload = {
            "event": "payment.captured",
            "payment_id": "pay_abc",
            "order_id": "order_xyz",
            "amount": 99900,
        }
        event = provider.parse_webhook(payload)
        assert isinstance(event, WebhookEvent)
        assert event.event_type == "payment.captured"
        assert event.payment_id == "pay_abc"
        assert event.order_id == "order_xyz"
        assert event.status == "captured"


class TestRazorpayProviderSignatureVerification:
    """Razorpay webhook signature verification (no HTTP calls)."""

    def test_verify_webhook_valid_signature(self):
        webhook_secret = "test_webhook_secret"
        provider = RazorpayProvider(
            key_id="rzp_test_key",
            key_secret="rzp_test_secret",
            webhook_secret=webhook_secret,
        )

        body = b'{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_123"}}}}'
        # Generate valid signature
        expected = hmac.new(
            webhook_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()

        assert provider.verify_webhook_signature(body, expected) is True

    def test_verify_webhook_invalid_signature(self):
        provider = RazorpayProvider(
            key_id="rzp_test",
            key_secret="secret",
            webhook_secret="webhook_secret",
        )
        assert provider.verify_webhook_signature(b"body", "wrong_signature") is False

    def test_parse_webhook_event(self):
        provider = RazorpayProvider(
            key_id="key", key_secret="secret", webhook_secret="webhook"
        )
        payload = {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_test_123",
                        "order_id": "order_test_456",
                        "amount": 50000,
                        "status": "captured",
                    }
                }
            },
        }
        event = provider.parse_webhook(payload)
        assert event.event_type == "payment.captured"
        assert event.payment_id == "pay_test_123"
        assert event.order_id == "order_test_456"
        assert event.amount_in_paise == 50000
        assert event.status == "captured"


class TestDataclasses:
    """Verify dataclass fields and defaults."""

    def test_order_result_defaults(self):
        result = OrderResult(
            order_id="ord_1",
            amount_in_paise=10000,
            currency="INR",
            provider="test",
        )
        assert result.provider_key_id is None
        assert result.raw_response is None

    def test_verification_result_no_error(self):
        result = VerificationResult(
            verified=True,
            payment_id="pay_1",
            order_id="ord_1",
        )
        assert result.error is None

    def test_webhook_event_fields(self):
        event = WebhookEvent(
            event_type="payment.failed",
            payment_id="pay_fail",
            order_id="ord_1",
            amount_in_paise=5000,
            status="failed",
            raw_payload={"event": "payment.failed"},
        )
        assert event.event_type == "payment.failed"
        assert event.raw_payload["event"] == "payment.failed"


class TestPaymentProviderError:
    """PaymentProviderError exception."""

    def test_error_message(self):
        exc = PaymentProviderError("Order creation failed: 500")
        assert str(exc) == "Order creation failed: 500"

    def test_is_exception(self):
        exc = PaymentProviderError("test")
        assert isinstance(exc, Exception)
