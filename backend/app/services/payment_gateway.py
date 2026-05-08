"""
Payment gateway abstraction layer.

Provider Abstraction Reasoning:
───────────────────────────────
Razorpay is the primary gateway (dominant in Indian SaaS),
but business logic must NOT be coupled to any single provider.

Why:
1. Provider lock-in is a business risk (pricing changes, outages, compliance)
2. Testing requires a mock provider (no real payments in CI)
3. Future: may add UPI-direct, PayTM, or Stripe for international
4. Clean separation = each provider handles its own API quirks

Interface:
- create_order() → Start a payment session
- verify_payment() → Validate payment after checkout (signature check)
- create_refund() → Process refund (future)

Webhook Security:
─────────────────
- Razorpay sends webhook events signed with a webhook secret
- We verify the HMAC-SHA256 signature before processing ANY event
- This prevents spoofed webhooks from attackers
- The webhook secret is separate from the API key (defense in depth)

Idempotency:
────────────
- Every payment intent gets a unique idempotency_key (the invoice ID)
- Webhook processing checks if the invoice is already marked PAID
- Duplicate webhooks are safely ignored (no double-charging)
- This is critical because webhooks can be retried by Razorpay
"""

import hashlib
import hmac
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("gymflow.billing")


@dataclass
class OrderResult:
    """Result from creating a payment order/session."""
    order_id: str
    amount_in_paise: int
    currency: str
    provider: str
    provider_key_id: str | None = None  # Public key for frontend checkout
    raw_response: dict | None = None


@dataclass
class VerificationResult:
    """Result from verifying a payment."""
    verified: bool
    payment_id: str
    order_id: str
    error: str | None = None


@dataclass
class WebhookEvent:
    """Parsed webhook event."""
    event_type: str
    payment_id: str | None
    order_id: str | None
    amount_in_paise: int | None
    status: str | None
    raw_payload: dict


class PaymentProvider(ABC):
    """
    Abstract payment provider interface.

    Every provider must implement these methods.
    Business logic (subscription service) only talks to this interface.
    """

    @abstractmethod
    async def create_order(
        self,
        amount_in_paise: int,
        currency: str,
        receipt: str,
        notes: dict[str, str] | None = None,
    ) -> OrderResult:
        """Create a payment order/session."""
        ...

    @abstractmethod
    async def verify_payment(
        self,
        payment_id: str,
        order_id: str,
        signature: str,
    ) -> VerificationResult:
        """Verify payment signature after checkout."""
        ...

    @abstractmethod
    def verify_webhook_signature(
        self,
        body: bytes,
        signature: str,
    ) -> bool:
        """Verify webhook request is genuinely from the provider."""
        ...

    @abstractmethod
    def parse_webhook(self, payload: dict) -> WebhookEvent:
        """Parse a webhook payload into a normalized event."""
        ...


class RazorpayProvider(PaymentProvider):
    """
    Razorpay payment gateway implementation.

    Uses Razorpay Orders API:
    1. Backend creates an Order (amount, currency, receipt)
    2. Frontend opens Razorpay Checkout with the order_id
    3. After payment, frontend sends payment_id + order_id + signature to backend
    4. Backend verifies the signature (HMAC-SHA256)
    5. On success, mark invoice as PAID and subscription as ACTIVE
    """

    def __init__(self, key_id: str, key_secret: str, webhook_secret: str):
        self.key_id = key_id
        self.key_secret = key_secret
        self.webhook_secret = webhook_secret

    async def create_order(
        self,
        amount_in_paise: int,
        currency: str = "INR",
        receipt: str = "",
        notes: dict[str, str] | None = None,
    ) -> OrderResult:
        """
        Create a Razorpay order via their API.

        Uses httpx for async HTTP. The order_id is used by the frontend
        to open the Razorpay checkout widget.
        """
        import httpx
        import base64

        auth_str = f"{self.key_id}:{self.key_secret}"
        auth_header = base64.b64encode(auth_str.encode()).decode()

        payload: dict[str, Any] = {
            "amount": amount_in_paise,
            "currency": currency,
            "receipt": receipt,
        }
        if notes:
            payload["notes"] = notes

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.razorpay.com/v1/orders",
                json=payload,
                headers={
                    "Authorization": f"Basic {auth_header}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )

        if response.status_code != 200:
            logger.error(f"Razorpay order creation failed: {response.status_code} {response.text}")
            raise PaymentProviderError(f"Payment order creation failed: {response.text}")

        data = response.json()
        logger.info(f"Razorpay order created: {data.get('id')} for {amount_in_paise} paise")

        return OrderResult(
            order_id=data["id"],
            amount_in_paise=data["amount"],
            currency=data["currency"],
            provider="razorpay",
            provider_key_id=self.key_id,
            raw_response=data,
        )

    async def verify_payment(
        self,
        payment_id: str,
        order_id: str,
        signature: str,
    ) -> VerificationResult:
        """
        Verify Razorpay payment signature.

        Razorpay's verification: HMAC-SHA256(order_id + "|" + payment_id, key_secret)
        This proves the payment callback is genuine (not forged by an attacker).
        """
        message = f"{order_id}|{payment_id}"
        expected_signature = hmac.new(
            self.key_secret.encode(),
            message.encode(),
            hashlib.sha256,
        ).hexdigest()

        verified = hmac.compare_digest(expected_signature, signature)

        if not verified:
            logger.warning(f"Payment verification FAILED: order={order_id}, payment={payment_id}")

        return VerificationResult(
            verified=verified,
            payment_id=payment_id,
            order_id=order_id,
            error=None if verified else "Signature mismatch",
        )

    def verify_webhook_signature(self, body: bytes, signature: str) -> bool:
        """
        Verify Razorpay webhook signature.

        Uses a SEPARATE webhook secret (not the API key secret).
        This is defense-in-depth: even if the API key leaks,
        webhooks can't be spoofed without the webhook secret.
        """
        expected = hmac.new(
            self.webhook_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def parse_webhook(self, payload: dict) -> WebhookEvent:
        """Parse Razorpay webhook into normalized event."""
        event_type = payload.get("event", "unknown")
        entity = payload.get("payload", {}).get("payment", {}).get("entity", {})

        return WebhookEvent(
            event_type=event_type,
            payment_id=entity.get("id"),
            order_id=entity.get("order_id"),
            amount_in_paise=entity.get("amount"),
            status=entity.get("status"),
            raw_payload=payload,
        )


class MockProvider(PaymentProvider):
    """
    Mock payment provider for development and testing.

    Simulates successful payments without hitting any real gateway.
    All orders auto-succeed, all signatures auto-verify.
    """

    async def create_order(
        self,
        amount_in_paise: int,
        currency: str = "INR",
        receipt: str = "",
        notes: dict[str, str] | None = None,
    ) -> OrderResult:
        import uuid
        order_id = f"mock_order_{uuid.uuid4().hex[:12]}"
        logger.info(f"[MOCK] Order created: {order_id} for {amount_in_paise} paise")
        return OrderResult(
            order_id=order_id,
            amount_in_paise=amount_in_paise,
            currency=currency,
            provider="mock",
            provider_key_id="mock_key",
        )

    async def verify_payment(
        self,
        payment_id: str,
        order_id: str,
        signature: str,
    ) -> VerificationResult:
        logger.info(f"[MOCK] Payment verified: {payment_id}")
        return VerificationResult(
            verified=True,
            payment_id=payment_id,
            order_id=order_id,
        )

    def verify_webhook_signature(self, body: bytes, signature: str) -> bool:
        return True  # Always valid in mock mode

    def parse_webhook(self, payload: dict) -> WebhookEvent:
        return WebhookEvent(
            event_type=payload.get("event", "payment.captured"),
            payment_id=payload.get("payment_id", "mock_pay_123"),
            order_id=payload.get("order_id", "mock_order_123"),
            amount_in_paise=payload.get("amount"),
            status="captured",
            raw_payload=payload,
        )


class PaymentProviderError(Exception):
    """Raised when the payment provider returns an error."""
    pass


# === Provider singleton ===

_provider: PaymentProvider | None = None


def configure_payment_provider(provider: PaymentProvider) -> None:
    """Set the active payment provider. Called once at startup."""
    global _provider
    _provider = provider
    logger.info(f"Payment provider configured: {type(provider).__name__}")


def get_payment_provider() -> PaymentProvider:
    """Get the active payment provider."""
    if _provider is None:
        raise RuntimeError("Payment provider not configured. Call configure_payment_provider() at startup.")
    return _provider
