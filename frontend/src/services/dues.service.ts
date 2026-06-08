import { request } from "@/lib/api";
import type { PaymentMethod } from "./payment.service";

// --- Types ---

export type DueStatus = "pending" | "partial" | "paid" | "waived";

export interface DueMemberBrief {
  id: string;
  name: string;
  phone: string;
  photo_url: string | null;
}

export interface DueResponse {
  id: string;
  gym_id: string;
  member_id: string;
  plan_name: string;
  plan_amount_paise: number;
  discount_paise: number;
  effective_amount_paise: number;
  total_paid_paise: number;
  balance_paise: number;
  due_date: string;
  status: DueStatus;
  waive_reason: string | null;
  created_at: string;
  updated_at: string;
  member: DueMemberBrief | null;
}

export interface DuePaymentLink {
  id: string;
  payment_id: string;
  amount_paise: number;
  created_at: string;
}

export interface DueDetailResponse extends DueResponse {
  payments: DuePaymentLink[];
}

export interface DueListResponse {
  items: DueResponse[];
  total: number;
  total_outstanding_paise: number;
}

export interface DueSummaryResponse {
  total_members_with_dues: number;
  total_outstanding_paise: number;
  collected_this_month_paise: number;
}

export interface AgingBucket {
  range: string;
  count: number;
  total_paise: number;
}

export interface AgingReportResponse {
  buckets: AgingBucket[];
  total_outstanding_paise: number;
}

export interface ListDuesParams {
  skip?: number;
  limit?: number;
  status?: DueStatus;
  member_id?: string;
}

export interface PayDuePayload {
  amount_in_paise: number;
  payment_method: PaymentMethod;
  payment_date?: string;
  notes?: string;
  idempotency_key?: string;
}

export interface WaiveDuePayload {
  reason: string;
}

// --- Helpers ---

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      parts.push(`${key}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

// --- Service ---

export const duesService = {
  async list(params: ListDuesParams = {}): Promise<DueListResponse> {
    const query = buildQuery(params as Record<string, string | number | undefined>);
    return request.get<DueListResponse>(`/dues${query}`);
  },

  async getSummary(): Promise<DueSummaryResponse> {
    return request.get<DueSummaryResponse>("/dues/summary");
  },

  async getAgingReport(): Promise<AgingReportResponse> {
    return request.get<AgingReportResponse>("/dues/aging-report");
  },

  async getMemberDues(memberId: string): Promise<DueResponse[]> {
    return request.get<DueResponse[]>(`/dues/member/${memberId}`);
  },

  async getDetail(dueId: string): Promise<DueDetailResponse> {
    return request.get<DueDetailResponse>(`/dues/${dueId}`);
  },

  async pay(dueId: string, payload: PayDuePayload): Promise<DueResponse> {
    return request.post<DueResponse>(`/dues/${dueId}/pay`, payload);
  },

  async waive(dueId: string, payload: WaiveDuePayload): Promise<DueResponse> {
    return request.post<DueResponse>(`/dues/${dueId}/waive`, payload);
  },
};
