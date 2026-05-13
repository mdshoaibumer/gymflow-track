import { request } from "@/lib/api";

// === Types ===

export interface GrowthTrendPoint {
  period: string;
  count: number;
}

export interface PlanDistributionItem {
  tier: string;
  name: string;
  count: number;
}

export interface SaaSMetrics {
  total_gyms: number;
  active_subscriptions: number;
  trial_gyms: number;
  suspended_gyms: number;
  locked_gyms: number;
  total_members: number;
  mrr_in_paise: number;
  arr_in_paise: number;
  failed_payments: number;
  plan_distribution: PlanDistributionItem[];
  gym_growth_trend: GrowthTrendPoint[];
  revenue_trend: GrowthTrendPoint[];
}

export interface GymOwnerInfo {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface GymDirectoryItem {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string | null;
  owner: GymOwnerInfo | null;
  subscription_status: string | null;
  plan_name: string | null;
  plan_tier: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  member_count: number;
  active_staff: number;
  revenue_in_paise: number;
  last_payment_date: string | null;
}

export interface GymDirectoryResponse {
  gyms: GymDirectoryItem[];
  total: number;
}

export interface StaffInfo {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  is_active: boolean;
}

export interface InvoiceInfo {
  id: string;
  invoice_number: string;
  amount_in_paise: number;
  status: string;
  period_start: string;
  period_end: string;
  paid_at: string | null;
}

export interface SubscriptionTimelineEntry {
  date: string;
  action: string;
  description: string;
  metadata: Record<string, unknown> | null;
}

export interface GymDetail {
  id: string;
  name: string;
  slug: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string | null;
  owner: GymOwnerInfo | null;
  subscription_status: string | null;
  plan_name: string | null;
  plan_tier: string | null;
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  days_remaining: number | null;
  member_count: number;
  active_member_count: number;
  staff_count: number;
  total_revenue_in_paise: number;
  staff: StaffInfo[];
  invoices: InvoiceInfo[];
  subscription_timeline: SubscriptionTimelineEntry[];
}

export interface AdminActionResponse {
  success: boolean;
  message: string;
  gym_id: string;
  action: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_gym_id: string | null;
  target_gym_name: string | null;
  description: string;
  metadata_json: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string | null;
}

export interface AuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
}

export interface ImpersonationResponse {
  access_token: string;
  token_type: string;
  expires_in_minutes: number;
  gym_id: string;
  gym_name: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  impersonator_id: string;
}

export interface PlatformAnalytics {
  member_growth: GrowthTrendPoint[];
  gym_growth: GrowthTrendPoint[];
  revenue_trend: GrowthTrendPoint[];
  payment_success_rate: number | null;
  top_gyms: Array<{ id: string; name: string; revenue_in_paise: number }>;
  inactive_gyms: Array<{ id: string; name: string; created_at: string | null }>;
  feature_adoption: Record<string, number>;
}

export interface HealthAlert {
  level: "info" | "warning" | "critical";
  title: string;
  description: string;
  count: number;
  timestamp: string | null;
}

export interface PlatformHealth {
  status: "healthy" | "degraded" | "critical";
  failed_payments_24h: number;
  failed_payments_7d: number;
  inactive_gyms_30d: number;
  alerts: HealthAlert[];
}

export interface PlatformSettings {
  default_trial_days: number;
  grace_period_days: number;
  max_payment_retries: number;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  announcement_active: boolean;
  announcement_message: string | null;
  announcement_type: string;
  max_gyms: number;
  feature_flags: Record<string, unknown> | null;
}

// === API ===

export interface ListGymsParams {
  skip?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export const adminService = {
  // Dashboard
  getMetrics: () =>
    request.get<SaaSMetrics>("/admin/metrics"),

  // Gym Directory
  listGyms: (params: ListGymsParams = {}) => {
    const query = new URLSearchParams();
    if (params.skip) query.set("skip", String(params.skip));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.search) query.set("search", params.search);
    if (params.status) query.set("status", params.status);
    const qs = query.toString();
    return request.get<GymDirectoryResponse>(`/admin/gyms${qs ? `?${qs}` : ""}`);
  },

  getGymDetail: (gymId: string) =>
    request.get<GymDetail>(`/admin/gyms/${gymId}`),

  // Gym Actions
  extendTrial: (gymId: string, days: number, reason: string) =>
    request.post<AdminActionResponse>(`/admin/gyms/${gymId}/extend-trial`, { days, reason }),

  suspendGym: (gymId: string, reason: string) =>
    request.post<AdminActionResponse>(`/admin/gyms/${gymId}/suspend`, { reason }),

  unsuspendGym: (gymId: string, reason: string) =>
    request.post<AdminActionResponse>(`/admin/gyms/${gymId}/unsuspend`, { reason }),

  lockGym: (gymId: string, reason: string) =>
    request.post<AdminActionResponse>(`/admin/gyms/${gymId}/lock`, { reason }),

  unlockGym: (gymId: string, newStatus: string, reason: string) =>
    request.post<AdminActionResponse>(`/admin/gyms/${gymId}/unlock`, { new_status: newStatus, reason }),

  changePlan: (gymId: string, planTier: string, reason: string) =>
    request.post<AdminActionResponse>(`/admin/gyms/${gymId}/change-plan`, { plan_tier: planTier, reason }),

  activateSubscription: (gymId: string) =>
    request.post<AdminActionResponse>(`/admin/gyms/${gymId}/activate`),

  deleteGym: (gymId: string, confirmName: string, reason: string) =>
    request.delete<AdminActionResponse>(`/admin/gyms/${gymId}`, { confirm_name: confirmName, reason }),

  // Impersonation
  impersonateGymOwner: (gymId: string) =>
    request.post<ImpersonationResponse>(`/admin/gyms/${gymId}/impersonate`),

  endImpersonation: (gymId: string) =>
    request.post<AdminActionResponse>(`/admin/gyms/${gymId}/end-impersonation`),

  // Analytics
  getAnalytics: () =>
    request.get<PlatformAnalytics>("/admin/analytics"),

  // Health
  getHealth: () =>
    request.get<PlatformHealth>("/admin/health"),

  // Settings
  getSettings: () =>
    request.get<PlatformSettings>("/admin/settings"),

  updateSettings: (data: Partial<PlatformSettings>) =>
    request.put<PlatformSettings>("/admin/settings", data),

  // Audit Logs
  getAuditLogs: (params: { skip?: number; limit?: number; gym_id?: string; action?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.skip) query.set("skip", String(params.skip));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.gym_id) query.set("gym_id", params.gym_id);
    if (params.action) query.set("action", params.action);
    const qs = query.toString();
    return request.get<AuditLogResponse>(`/admin/audit-logs${qs ? `?${qs}` : ""}`);
  },
};
