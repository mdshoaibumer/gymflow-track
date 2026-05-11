import { apiClient } from "@/lib/api";

// --- Types ---

export interface RevenueTrendPoint {
  period: string;
  revenue_paise: number;
  payment_count: number;
}

export interface RevenueSummary {
  total_revenue_paise: number;
  previous_period_revenue_paise: number;
  growth_percent: number | null;
  average_revenue_paise: number;
  pending_dues_paise: number;
  best_collection_day: string | null;
  collection_rate_percent: number;
}

export interface RevenueTrendResponse {
  granularity: string;
  data: RevenueTrendPoint[];
  summary: RevenueSummary;
}

export interface PlanDistribution {
  plan: string;
  member_count: number;
  percentage: number;
  revenue_contribution_paise: number;
}

export interface MembershipDistributionResponse {
  distributions: PlanDistribution[];
  total_members: number;
  most_popular_plan: string | null;
}

export interface KPICard {
  key: string;
  label: string;
  value: number | string;
  previous_value: number | string | null;
  growth_percent: number | null;
  unit: string;
}

export interface DashboardKPIsResponse {
  kpis: KPICard[];
  period_label: string;
}

// --- Query params ---

export interface RevenueTrendParams {
  granularity?: "daily" | "weekly" | "monthly";
  date_from?: string;
  date_to?: string;
}

export interface DashboardKPIsParams {
  period_days?: number;
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

export const analyticsService = {
  async getRevenueTrend(params: RevenueTrendParams = {}): Promise<RevenueTrendResponse> {
    const query = buildQuery(params as Record<string, string | number | undefined>);
    return apiClient<RevenueTrendResponse>(`/analytics/revenue-trend${query}`);
  },

  async getRevenueSummary(params: { date_from?: string; date_to?: string } = {}): Promise<RevenueSummary> {
    const query = buildQuery(params as Record<string, string | number | undefined>);
    return apiClient<RevenueSummary>(`/analytics/revenue-summary${query}`);
  },

  async getMembershipDistribution(): Promise<MembershipDistributionResponse> {
    return apiClient<MembershipDistributionResponse>("/analytics/membership-distribution");
  },

  async getDashboardKPIs(params: DashboardKPIsParams = {}): Promise<DashboardKPIsResponse> {
    const query = buildQuery(params as Record<string, string | number | undefined>);
    return apiClient<DashboardKPIsResponse>(`/analytics/dashboard-kpis${query}`);
  },
};
