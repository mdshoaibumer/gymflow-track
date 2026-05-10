import { apiClient } from "@/lib/api";

// --- Types ---

export type PaymentMethod = "cash" | "upi" | "card" | "bank_transfer" | "other";
export type PaymentStatus = "completed" | "pending" | "failed" | "refunded";

export interface Payment {
  id: string;
  gym_id: string;
  member_id: string;
  amount_in_paise: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_date: string;
  notes: string | null;
  created_by: string | null;
  member_name: string | null;
}

export interface PaymentListResponse {
  payments: Payment[];
  total: number;
}

export interface CreatePaymentPayload {
  member_id: string;
  amount_in_paise: number;
  payment_method: PaymentMethod;
  payment_status?: PaymentStatus;
  payment_date?: string;
  notes?: string;
  membership_start?: string;
  membership_end?: string;
  membership_plan?: string;
}

export interface ListPaymentsParams {
  skip?: number;
  limit?: number;
  member_id?: string;
  status?: PaymentStatus;
  date_from?: string;
  date_to?: string;
}

// --- Dashboard types ---

export interface DashboardMetrics {
  total_members: number;
  active_members: number;
  expiring_soon: number;
  expired_members: number;
  pending_dues_count: number;
  monthly_revenue_paise: number;
}

export interface ExpiringMember {
  id: string;
  name: string;
  phone: string;
  membership_plan: string | null;
  membership_end: string | null;
}

export interface RecentPayment {
  id: string;
  member_id: string;
  amount_in_paise: number;
  payment_method: PaymentMethod;
  payment_date: string;
}

// --- Service ---

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      parts.push(`${key}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export const paymentService = {
  async create(payload: CreatePaymentPayload): Promise<Payment> {
    return apiClient<Payment>("/payments", {
      method: "POST",
      body: payload,
    });
  },

  async list(params: ListPaymentsParams = {}): Promise<PaymentListResponse> {
    const query = buildQuery(params as Record<string, string | number | undefined>);
    return apiClient<PaymentListResponse>(`/payments${query}`);
  },

  async get(paymentId: string): Promise<Payment> {
    return apiClient<Payment>(`/payments/${paymentId}`);
  },

  async listByMember(
    memberId: string,
    params: { skip?: number; limit?: number } = {}
  ): Promise<PaymentListResponse> {
    const query = buildQuery(params as Record<string, string | number | undefined>);
    return apiClient<PaymentListResponse>(`/members/${memberId}/payments${query}`);
  },
};

export const dashboardService = {
  async getMetrics(): Promise<DashboardMetrics> {
    return apiClient<DashboardMetrics>("/dashboard/metrics");
  },

  async getExpiring(days: number = 7): Promise<ExpiringMember[]> {
    return apiClient<ExpiringMember[]>(`/dashboard/expiring?days=${days}`);
  },

  async getRecentPayments(limit: number = 10): Promise<RecentPayment[]> {
    return apiClient<RecentPayment[]>(`/dashboard/recent-payments?limit=${limit}`);
  },
};
