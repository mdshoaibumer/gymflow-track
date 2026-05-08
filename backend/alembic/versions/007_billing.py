"""007 — Subscription billing tables

Creates:
- subscription_plans: Predefined plan catalog
- gym_subscriptions: One active subscription per gym
- invoices: Payment/billing history

Revision ID: 007_billing
Revises: 006_feedback
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers
revision = "007_billing"
down_revision = "006_feedback"
branch_labels = None
depends_on = None


def upgrade():
    # Enum types
    billing_status = sa.Enum(
        "trial", "active", "past_due", "cancelled", "expired",
        name="billingstatus"
    )
    plan_tier = sa.Enum("starter", "pro", "enterprise", name="plantier")
    billing_interval = sa.Enum("monthly", name="billinginterval")
    invoice_status = sa.Enum("pending", "paid", "failed", "refunded", name="invoicestatus")

    # === subscription_plans ===
    op.create_table(
        "subscription_plans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("tier", plan_tier, nullable=False, unique=True),
        sa.Column("price_in_paise", sa.Integer(), nullable=False),
        sa.Column("billing_interval", billing_interval, nullable=False, server_default="monthly"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("max_members", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("max_staff_users", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("sms_notifications_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("advanced_reports_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # === gym_subscriptions ===
    op.create_table(
        "gym_subscriptions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", UUID(as_uuid=True), sa.ForeignKey("subscription_plans.id"), nullable=False),
        sa.Column("status", billing_status, nullable=False, server_default="trial"),
        sa.Column("trial_start", sa.Date(), nullable=True),
        sa.Column("trial_end", sa.Date(), nullable=True),
        sa.Column("current_period_start", sa.Date(), nullable=True),
        sa.Column("current_period_end", sa.Date(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("razorpay_subscription_id", sa.String(100), nullable=True),
        sa.Column("razorpay_customer_id", sa.String(100), nullable=True),
        sa.Column("payment_retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_payment_attempt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("gym_id", name="uq_gym_subscriptions_gym_id"),
    )
    op.create_index("ix_gym_subscriptions_gym_id", "gym_subscriptions", ["gym_id"])
    op.create_index("ix_gym_subscriptions_status", "gym_subscriptions", ["status"])

    # === invoices ===
    op.create_table(
        "invoices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("gym_id", UUID(as_uuid=True), sa.ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subscription_id", UUID(as_uuid=True), sa.ForeignKey("gym_subscriptions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invoice_number", sa.String(50), nullable=False, unique=True),
        sa.Column("amount_in_paise", sa.Integer(), nullable=False),
        sa.Column("status", invoice_status, nullable=False, server_default="pending"),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("razorpay_payment_id", sa.String(100), nullable=True),
        sa.Column("razorpay_order_id", sa.String(100), nullable=True),
        sa.Column("razorpay_signature", sa.String(255), nullable=True),
        sa.Column("idempotency_key", sa.String(100), nullable=True, unique=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_invoices_gym_id", "invoices", ["gym_id"])
    op.create_index("ix_invoices_gym_created", "invoices", ["gym_id", "created_at"])
    op.create_index("ix_invoices_invoice_number", "invoices", ["invoice_number"])
    op.create_index("ix_invoices_idempotency_key", "invoices", ["idempotency_key"])

    # Seed default plans
    op.execute("""
        INSERT INTO subscription_plans (id, name, tier, price_in_paise, billing_interval, description, max_members, max_staff_users, sms_notifications_enabled, advanced_reports_enabled, is_active)
        VALUES
            ('00000000-0000-4000-8000-000000000001', 'Starter', 'starter', 99900, 'monthly', 'Perfect for small gyms getting started. Manage up to 50 members with essential tools.', 50, 2, false, false, true),
            ('00000000-0000-4000-8000-000000000002', 'Pro', 'pro', 199900, 'monthly', 'For growing gyms that need more power. Unlimited members, SMS reminders, and advanced reports.', 500, 10, true, true, true),
            ('00000000-0000-4000-8000-000000000003', 'Enterprise', 'enterprise', 499900, 'monthly', 'Custom solutions for multi-location gyms. Contact us for details.', 9999, 50, true, true, false)
    """)


def downgrade():
    op.drop_table("invoices")
    op.drop_table("gym_subscriptions")
    op.drop_table("subscription_plans")
    op.execute("DROP TYPE IF EXISTS invoicestatus")
    op.execute("DROP TYPE IF EXISTS billinginterval")
    op.execute("DROP TYPE IF EXISTS plantier")
    op.execute("DROP TYPE IF EXISTS billingstatus")
