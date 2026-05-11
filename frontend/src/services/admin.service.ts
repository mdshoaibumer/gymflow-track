import { apiClient } from "@/lib/api";

// === Types ===

export interface SaaSMetrics {
  total_gyms: number;
  active_subscriptions: number;
  trial_gyms: number;
  suspended_gyms: number;
  total_members: number;
  mrr_in_paise: number;
  failed_payments: number;
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

// === API ===

export interface ListGymsParams {
  skip?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export const adminService = {
  getMetrics: () =>
    apiClient<SaaSMetrics>("/admin/metrics"),

  listGyms: (params: ListGymsParams = {}) => {
    const query = new URLSearchParams();
    if (params.skip) query.set("skip", String(params.skip));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.search) query.set("search", params.search);
    if (params.status) query.set("status", params.status);
    const qs = query.toString();
    return apiClient<GymDirectoryResponse>(`/admin/gyms${qs ? `?${qs}` : ""}`);
  },

  getGymDetail: (gymId: string) =>
    apiClient<GymDetail>(`/admin/gyms/${gymId}`),

  extendTrial: (gymId: string, days: number, reason: string) =>
    apiClient<AdminActionResponse>(`/admin/gyms/${gymId}/extend-trial`, {
      method: "POST",
      body: { days, reason },
    }),

  suspendGym: (gymId: string, reason: string) =>
    apiClient<AdminActionResponse>(`/admin/gyms/${gymId}/suspend`, {
      method: "POST",
      body: { reason },
    }),

  unsuspendGym: (gymId: string, reason: string) =>
    apiClient<AdminActionResponse>(`/admin/gyms/${gymId}/unsuspend`, {
      method: "POST",
      body: { reason },
    }),

  lockGym: (gymId: string, reason: string) =>
    apiClient<AdminActionResponse>(`/admin/gyms/${gymId}/lock`, {
      method: "POST",
      body: { reason },
    }),

  unlockGym: (gymId: string, newStatus: string, reason: string) =>
    apiClient<AdminActionResponse>(`/admin/gyms/${gymId}/unlock`, {
      method: "POST",
      body: { new_status: newStatus, reason },
    }),

  changePlan: (gymId: string, planTier: string, reason: string) =>
    apiClient<AdminActionResponse>(`/admin/gyms/${gymId}/change-plan`, {
      method: "POST",
      body: { plan_tier: planTier, reason },
    }),

  activateSubscription: (gymId: string) =>
    apiClient<AdminActionResponse>(`/admin/gyms/${gymId}/activate`, {
      method: "POST",
    }),

  getAuditLogs: (params: { skip?: number; limit?: number; gym_id?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.skip) query.set("skip", String(params.skip));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.gym_id) query.set("gym_id", params.gym_id);
    const qs = query.toString();
    return apiClient<AuditLogResponse>(`/admin/audit-logs${qs ? `?${qs}` : ""}`);
  },
};
