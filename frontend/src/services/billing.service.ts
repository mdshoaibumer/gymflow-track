import { request } from "@/lib/api";

// === Types ===

export type PlanTier = "starter" | "pro" | "elite" | "none";

export interface Plan {
  id: string;
  name: string;
  tier: PlanTier;
  price_in_paise: number;
  billing_interval: string;
  description: string | null;
  max_members: number;
  max_staff_users: number;
  sms_notifications_enabled: boolean;
  advanced_reports_enabled: boolean;
  qr_attendance_enabled: boolean;
  advanced_analytics_enabled: boolean;
  export_reports_enabled: boolean;
  multi_branch_enabled: boolean;
  automated_whatsapp_enabled: boolean;
  yearly_price_in_paise: number;
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
  plan_tier: PlanTier;
  plan_name: string;
  max_members: number;
  current_members: number;
  members_remaining: number;
  max_staff_users: number;
  current_staff_users: number;
  sms_notifications_enabled: boolean;
  advanced_reports_enabled: boolean;
  qr_attendance_enabled: boolean;
  advanced_analytics_enabled: boolean;
  export_reports_enabled: boolean;
  multi_branch_enabled: boolean;
  automated_whatsapp_enabled: boolean;
  is_at_member_limit: boolean;
  is_at_staff_limit: boolean;
  member_usage_percent: number;
  staff_usage_percent: number;
  is_unlimited_members: boolean;
  is_unlimited_staff: boolean;
  subscription_status: string;
  days_remaining: number | null;
  current_period_end: string | null;
  yearly_price_in_paise: number;
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

/**
 * Feature names that can be gated based on subscription plan.
 * Used as keys for the feature access check system.
 */
export type FeatureName =
  | "qr_attendance"
  | "advanced_analytics"
  | "export_reports"
  | "multi_branch"
  | "automated_whatsapp"
  | "advanced_reports"
  | "sms_notifications";

/**
 * Maps each feature to the minimum plan tier required.
 */
export const FEATURE_REQUIRED_PLAN: Record<FeatureName, PlanTier> = {
  qr_attendance: "pro",
  advanced_analytics: "pro",
  export_reports: "pro",
  advanced_reports: "pro",
  multi_branch: "elite",
  automated_whatsapp: "elite",
  sms_notifications: "starter",
};

/**
 * Human-readable feature display names for upgrade prompts.
 */
export const FEATURE_DISPLAY_NAMES: Record<FeatureName, string> = {
  qr_attendance: "QR Attendance",
  advanced_analytics: "Advanced Analytics",
  export_reports: "Export Reports",
  advanced_reports: "Advanced Reports",
  multi_branch: "Multi-Branch Management",
  automated_whatsapp: "Automated WhatsApp Reminders",
  sms_notifications: "SMS Notifications",
};

/**
 * Feature descriptions for upgrade prompts.
 */
export const FEATURE_DESCRIPTIONS: Record<FeatureName, string[]> = {
  qr_attendance: [
    "QR-based attendance tracking",
    "Faster member check-ins",
    "Attendance analytics & insights",
  ],
  advanced_analytics: [
    "Revenue trend analysis",
    "Membership distribution insights",
    "Business performance KPIs",
  ],
  export_reports: [
    "Export members as CSV",
    "Export payments as CSV",
    "Export attendance reports",
  ],
  advanced_reports: [
    "Detailed revenue reports",
    "Member analytics reports",
    "Custom date range filtering",
  ],
  multi_branch: [
    "Manage multiple gym locations",
    "Centralized dashboard",
    "Cross-branch member management",
  ],
  automated_whatsapp: [
    "Automated payment reminders",
    "Membership renewal notifications",
    "Scheduled bulk messaging",
  ],
  sms_notifications: [
    "WhatsApp message reminders",
    "Payment due notifications",
    "Membership expiry alerts",
  ],
};

// === Service ===

export const billingService = {
  // Public — no auth needed
  getPlans: () => request.get<Plan[]>("/billing/plans"),

  // Authenticated
  getSubscription: () =>
    request.get<Subscription | null>("/billing/subscription"),

  subscribe: (planTier: string) =>
    request.post<SubscribeResult>("/billing/subscribe", { plan_tier: planTier }),

  verifyPayment: (
    data: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
  ) =>
    request.post<PaymentVerifyResult>("/billing/verify", data),

  cancel: (reason?: string) =>
    request.post<CancelResult>("/billing/cancel", { reason }),

  getHistory: () =>
    request.get<BillingHistory>("/billing/history"),

  getFeatureLimits: () =>
    request.get<FeatureLimits>("/billing/features"),

  getMetrics: () =>
    request.get<BillingMetrics>("/billing/metrics"),
};
