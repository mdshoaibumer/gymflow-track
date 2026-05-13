"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import {
  dashboardService,
  paymentService,
  type ListPaymentsParams,
  type CreatePaymentPayload,
} from "@/services/payment.service";
import { toast } from "sonner";

// ---- Dashboard ----

export function useDashboardMetrics() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["dashboard", "metrics"],
    queryFn: () => dashboardService.getMetrics(),
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useExpiringMembers(days = 7) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["dashboard", "expiring", days],
    queryFn: () => dashboardService.getExpiring(days),
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function useRecentPayments(limit = 5) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["dashboard", "recent-payments", limit],
    queryFn: () => dashboardService.getRecentPayments(limit),
    enabled: !!token,
    staleTime: 30_000,
  });
}

// ---- Payments ----

export function usePayments(params: ListPaymentsParams = {}) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["payments", params],
    queryFn: () => paymentService.list(params),
    enabled: !!token,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useMemberPayments(memberId: string, skip = 0, limit = 20) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["payments", "member", memberId, skip, limit],
    queryFn: () => paymentService.listByMember(memberId, { skip, limit }),
    enabled: !!token && !!memberId,
    staleTime: 15_000,
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePaymentPayload) =>
      paymentService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Payment recorded successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
