"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import {
  analyticsService,
  type RevenueTrendParams,
  type DashboardKPIsParams,
} from "@/services/analytics.service";

export function useRevenueTrend(params: RevenueTrendParams = {}) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["analytics", "revenue-trend", params],
    queryFn: () => analyticsService.getRevenueTrend(params),
    enabled: !!token,
    staleTime: 60_000,
    retry: 2,
  });
}

export function useRevenueSummary(params: { date_from?: string; date_to?: string } = {}) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["analytics", "revenue-summary", params],
    queryFn: () => analyticsService.getRevenueSummary(params),
    enabled: !!token,
    staleTime: 60_000,
    retry: 2,
  });
}

export function useMembershipDistribution() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["analytics", "membership-distribution"],
    queryFn: () => analyticsService.getMembershipDistribution(),
    enabled: !!token,
    staleTime: 120_000,
    retry: 2,
  });
}

export function useDashboardKPIs(params: DashboardKPIsParams = {}) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["analytics", "dashboard-kpis", params],
    queryFn: () => analyticsService.getDashboardKPIs(params),
    enabled: !!token,
    staleTime: 30_000,
    retry: 2,
  });
}
