"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import {
  dashboardService,
  paymentService,
  type ListPaymentsParams,
  type CreatePaymentPayload,
  type UpdatePaymentPayload,
  type VoidPaymentPayload,
} from "@/services/payment.service";
import { toast } from "sonner";

// ---- Dashboard ----

export function useDashboardMetrics() {
  const token = useAuthStore((s) => s.token);
  const gymId = useAuthStore((s) => s.user?.gym_id);
  return useQuery({
    queryKey: ["dashboard", "metrics", gymId],
    queryFn: () => dashboardService.getMetrics(),
    enabled: !!token && !!gymId,
    staleTime: 30_000,
  });
}

export function useExpiringMembers(days = 7) {
  const token = useAuthStore((s) => s.token);
  const gymId = useAuthStore((s) => s.user?.gym_id);
  return useQuery({
    queryKey: ["dashboard", "expiring", days, gymId],
    queryFn: () => dashboardService.getExpiring(days),
    enabled: !!token && !!gymId,
    staleTime: 60_000,
  });
}

export function useRecentPayments(limit = 5) {
  const token = useAuthStore((s) => s.token);
  const gymId = useAuthStore((s) => s.user?.gym_id);
  return useQuery({
    queryKey: ["dashboard", "recent-payments", limit, gymId],
    queryFn: () => dashboardService.getRecentPayments(limit),
    enabled: !!token && !!gymId,
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

export function useVoidPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, payload }: { paymentId: string; payload: VoidPaymentPayload }) =>
      paymentService.voidPayment(paymentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success("Payment successfully voided and ledger updated.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to void payment");
    },
  });
}

export function useUpdatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, payload }: { paymentId: string; payload: UpdatePaymentPayload }) =>
      paymentService.update(paymentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success("Payment updated successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update payment");
    },
  });
}
