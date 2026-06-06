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
  const gymId = useAuthStore((s) => s.user?.gym_id);
  return useQuery({
    queryKey: ["analytics", "revenue-trend", params, gymId],
    queryFn: () => analyticsService.getRevenueTrend(params),
    enabled: !!token && !!gymId,
    staleTime: 60_000,
    retry: 2,
  });
}

export function useRevenueSummary(params: { date_from?: string; date_to?: string } = {}) {
  const token = useAuthStore((s) => s.token);
  const gymId = useAuthStore((s) => s.user?.gym_id);
  return useQuery({
    queryKey: ["analytics", "revenue-summary", params, gymId],
    queryFn: () => analyticsService.getRevenueSummary(params),
    enabled: !!token && !!gymId,
    staleTime: 60_000,
    retry: 2,
  });
}

export function useMembershipDistribution() {
  const token = useAuthStore((s) => s.token);
  const gymId = useAuthStore((s) => s.user?.gym_id);
  return useQuery({
    queryKey: ["analytics", "membership-distribution", gymId],
    queryFn: () => analyticsService.getMembershipDistribution(),
    enabled: !!token && !!gymId,
    staleTime: 120_000,
    retry: 2,
  });
}

export function useDashboardKPIs(params: DashboardKPIsParams = {}, enabled = true) {
  const token = useAuthStore((s) => s.token);
  const gymId = useAuthStore((s) => s.user?.gym_id);
  return useQuery({
    queryKey: ["analytics", "dashboard-kpis", params, gymId],
    queryFn: () => analyticsService.getDashboardKPIs(params),
    enabled: !!token && !!gymId && enabled,
    staleTime: 30_000,
    retry: 2,
  });
}
