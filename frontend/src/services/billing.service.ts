import { apiClient } from "@/lib/api";

// === Types ===

export interface Plan {
  id: string;
  name: string;
  tier: string;
  price_in_paise: number;
  billing_interval: string;
  description: string | null;
  max_members: number;
  max_staff_users: number;
  sms_notifications_enabled: boolean;
  advanced_reports_enabled: boolean;
}

export interface Subscription {
  id: string;
  plan: Plan;
  status: "trial" | "active" | "past_due" | "cancelled" | "expired";
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  days_remaining: number | null;
  is_trial: boolean;
}

export interface SubscribeResult {
  subscription_id: string;
  razorpay_order_id: string | null;
  razorpay_key_id: string | null;
  amount_in_paise: number;
  currency: string;
  status: string;
}

export interface PaymentVerifyResult {
  verified: boolean;
  subscription_status: string;
  message: string;
}

export interface CancelResult {
  status: string;
  access_until: string | null;
  message: string;
}

export interface InvoiceItem {
  id: string;
  invoice_number: string;
  amount_in_paise: number;
  status: string;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  description: string | null;
  created_at: string;
}

export interface BillingHistory {
  invoices: InvoiceItem[];
  total: number;
}

export interface FeatureLimits {
  plan_tier: string;
  max_members: number;
  current_members: number;
  members_remaining: number;
  max_staff_users: number;
  current_staff_users: number;
  sms_notifications_enabled: boolean;
  advanced_reports_enabled: boolean;
  is_at_member_limit: boolean;
  is_at_staff_limit: boolean;
}

export interface BillingMetrics {
  mrr_in_paise: number;
  active_subscriptions: number;
  trial_subscriptions: number;
  past_due_subscriptions: number;
  cancelled_this_month: number;
  trial_conversion_rate: number | null;
  payment_failure_rate: number | null;
}

// === Service ===

export const billingService = {
  // Public — no auth needed
  getPlans: () => apiClient<Plan[]>("/billing/plans"),

  // Authenticated
  getSubscription: () =>
    apiClient<Subscription | null>("/billing/subscription"),

  subscribe: (planTier: string) =>
    apiClient<SubscribeResult>("/billing/subscribe", {
      method: "POST",
      body: { plan_tier: planTier },
    }),

  verifyPayment: (
    data: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
  ) =>
    apiClient<PaymentVerifyResult>("/billing/verify", {
      method: "POST",
      body: data,
    }),

  cancel: (reason?: string) =>
    apiClient<CancelResult>("/billing/cancel", {
      method: "POST",
      body: { reason },
    }),

  getHistory: () =>
    apiClient<BillingHistory>("/billing/history"),

  getFeatureLimits: () =>
    apiClient<FeatureLimits>("/billing/features"),

  getMetrics: () =>
    apiClient<BillingMetrics>("/billing/metrics"),
};
