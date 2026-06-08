"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import {
  duesService,
  type ListDuesParams,
  type PayDuePayload,
  type WaiveDuePayload,
} from "@/services/dues.service";
import { toast } from "sonner";

// ---- Dues List ----

export function useDues(params: ListDuesParams = {}) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["dues", params],
    queryFn: () => duesService.list(params),
    enabled: !!token,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

// ---- Dues Summary (Dashboard) ----

export function useDuesSummary() {
  const token = useAuthStore((s) => s.token);
  const gymId = useAuthStore((s) => s.user?.gym_id);
  return useQuery({
    queryKey: ["dues", "summary", gymId],
    queryFn: () => duesService.getSummary(),
    enabled: !!token && !!gymId,
    staleTime: 30_000,
  });
}

// ---- Aging Report ----

export function useDuesAgingReport() {
  const token = useAuthStore((s) => s.token);
  const gymId = useAuthStore((s) => s.user?.gym_id);
  return useQuery({
    queryKey: ["dues", "aging-report", gymId],
    queryFn: () => duesService.getAgingReport(),
    enabled: !!token && !!gymId,
    staleTime: 60_000,
  });
}

// ---- Member Dues ----

export function useMemberDues(memberId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["dues", "member", memberId],
    queryFn: () => duesService.getMemberDues(memberId),
    enabled: !!token && !!memberId,
    staleTime: 15_000,
  });
}

// ---- Due Detail ----

export function useDueDetail(dueId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["dues", "detail", dueId],
    queryFn: () => duesService.getDetail(dueId),
    enabled: !!token && !!dueId,
    staleTime: 15_000,
  });
}

// ---- Pay Due ----

export function usePayDue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dueId, payload }: { dueId: string; payload: PayDuePayload }) =>
      duesService.pay(dueId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dues"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success("Payment recorded against due");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to record payment");
    },
  });
}

// ---- Waive Due ----

export function useWaiveDue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dueId, payload }: { dueId: string; payload: WaiveDuePayload }) =>
      duesService.waive(dueId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dues"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success("Due waived successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to waive due");
    },
  });
}
