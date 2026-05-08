"""
Subscription + billing models for GymFlow SaaS.

SaaS Subscription Lifecycle:
─────────────────────────────
  Register → TRIAL (14 days free, full access)
     │
     ├─ Pay before trial ends → ACTIVE (monthly renewal)
     │
     ├─ Trial expires, no payment → EXPIRED (read-only grace for 7 days, then locked)
     │
     ├─ Payment fails during active → PAST_DUE (3 retry attempts over 7 days)
     │    ├─ Retry succeeds → ACTIVE
     │    └─ All retries fail → EXPIRED
     │
     └─ User cancels → CANCELLED (access until period ends, then EXPIRED)

MVP Pricing Simplicity:
- 2 real plans (Starter, Pro), 1 placeholder (Enterprise)
- Monthly billing only (no annual complexity yet)
- All prices in paise (INR * 100) for exact arithmetic
- No proration, no mid-cycle changes (upgrade takes effect next cycle)
- No coupons/discounts (add later when needed for sales)

Why this simplicity works for pilot:
- Small gyms need predictable, transparent pricing
- Monthly billing = low commitment barrier
- Simple upgrade path = easy upsell conversation
- No hidden costs = trust building
"""

import uuid
from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


# === Enums ===


class BillingStatus(str, PyEnum):
    """
    Subscription lifecycle states.

    TRIAL:     Free trial period, full access.
    ACTIVE:    Paid and current. All features available.
    PAST_DUE:  Payment failed, retrying. Features still available (grace period).
    CANCELLED: User cancelled. Access continues until current period ends.
    EXPIRED:   No active subscription. Read-only access, then locked.
    """
    TRIAL = "trial"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class PlanTier(str, PyEnum):
    """Available plan tiers."""
    STARTER = "starter"
    PRO = "pro"
    ENTERPRISE = "enterprise"  # Future placeholder


class BillingInterval(str, PyEnum):
    """Billing frequency."""
    MONTHLY = "monthly"
    # ANNUAL = "annual"  # Future: add when we have enough customers to justify discount


class InvoiceStatus(str, PyEnum):
    """Invoice payment states."""
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


# === Models ===


class SubscriptionPlan(BaseModel):
    """
    Predefined subscription plans.

    These are admin-seeded rows, not user-created.
    Keeps pricing centralized and auditable.
    """
    __tablename__ = "subscription_plans"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    tier: Mapped[PlanTier] = mapped_column(Enum(PlanTier), nullable=False, unique=True)
    price_in_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    billing_interval: Mapped[BillingInterval] = mapped_column(
        Enum(BillingInterval), default=BillingInterval.MONTHLY, nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Feature limits (simple gating — no entitlement engine)
    max_members: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    max_staff_users: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    sms_notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    advanced_reports_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    subscriptions = relationship("GymSubscription", back_populates="plan", lazy="raise")


class GymSubscription(BaseModel):
    """
    One subscription per gym (current state).

    Design: Each gym has exactly ONE active subscription row.
    History is tracked via invoices, not subscription row mutations.
    When a gym upgrades/downgrades, the existing row is updated.

    Why one-row-per-gym (not append-only):
    - Simpler queries: SELECT WHERE gym_id = ? (no date range logic)
    - Status is always current: no "find the latest" queries
    - History lives in invoices (audit trail)
    - Works perfectly for 10-500 gym scale
    """
    __tablename__ = "gym_subscriptions"
    __table_args__ = (
        UniqueConstraint("gym_id", name="uq_gym_subscriptions_gym_id"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscription_plans.id"),
        nullable=False
    )
    status: Mapped[BillingStatus] = mapped_column(
        Enum(BillingStatus), default=BillingStatus.TRIAL, nullable=False, index=True
    )

    # Trial tracking
    trial_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    trial_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Billing period
    current_period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    current_period_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Cancellation
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Payment provider references (Razorpay)
    razorpay_subscription_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    razorpay_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Retry tracking for failed payments
    payment_retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_payment_attempt: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    gym = relationship("Gym", lazy="raise")
    plan = relationship("SubscriptionPlan", back_populates="subscriptions", lazy="raise")
    invoices = relationship("Invoice", back_populates="subscription", lazy="raise")


class Invoice(BaseModel):
    """
    Billing history — one row per payment attempt/success.

    Serves as:
    - Audit trail for all billing events
    - Receipt reference for gym owners
    - Debugging tool for payment issues
    - Lightweight "invoice" without full accounting complexity

    Invoice numbering: INV-{YYYYMM}-{sequence}
    Example: INV-202605-0001
    """
    __tablename__ = "invoices"
    __table_args__ = (
        Index("ix_invoices_gym_created", "gym_id", "created_at"),
    )

    gym_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gyms.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gym_subscriptions.id", ondelete="CASCADE"),
        nullable=False
    )
    invoice_number: Mapped[str] = mapped_column(
        String(50), nullable=False, unique=True, index=True
    )
    amount_in_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus), default=InvoiceStatus.PENDING, nullable=False
    )

    # Period this invoice covers
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    # Payment provider references
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    razorpay_order_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    razorpay_signature: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Idempotency key — prevents duplicate payment processing
    idempotency_key: Mapped[str | None] = mapped_column(
        String(100), nullable=True, unique=True, index=True
    )

    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    gym = relationship("Gym", lazy="raise")
    subscription = relationship("GymSubscription", back_populates="invoices", lazy="raise")
