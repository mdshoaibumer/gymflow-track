"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminService, type ListGymsParams } from "@/services/admin.service";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "sonner";

export function useAdminMetrics() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: () => adminService.getMetrics(),
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useAdminGyms(params: ListGymsParams = {}) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin", "gyms", params],
    queryFn: () => adminService.listGyms(params),
    enabled: !!token,
    staleTime: 15_000,
  });
}

export function useAdminGymDetail(gymId: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin", "gym", gymId],
    queryFn: () => adminService.getGymDetail(gymId!),
    enabled: !!token && !!gymId,
    staleTime: 15_000,
  });
}

export function useAuditLogs(params: { skip?: number; limit?: number; gym_id?: string; action?: string } = {}) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin", "audit-logs", params],
    queryFn: () => adminService.getAuditLogs(params),
    enabled: !!token,
    staleTime: 15_000,
  });
}

export function useAdminAnalytics() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: () => adminService.getAnalytics(),
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function useAdminHealth() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => adminService.getHealth(),
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useAdminSettings() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => adminService.getSettings(),
    enabled: !!token,
    staleTime: 60_000,
  });
}

// === Mutations ===

export function useExtendTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gymId, days, reason }: { gymId: string; days: number; reason: string }) =>
      adminService.extendTrial(gymId, days, reason),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSuspendGym() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gymId, reason }: { gymId: string; reason: string }) =>
      adminService.suspendGym(gymId, reason),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUnsuspendGym() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gymId, reason }: { gymId: string; reason: string }) =>
      adminService.unsuspendGym(gymId, reason),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useLockGym() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gymId, reason }: { gymId: string; reason: string }) =>
      adminService.lockGym(gymId, reason),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUnlockGym() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gymId, newStatus, reason }: { gymId: string; newStatus: string; reason: string }) =>
      adminService.unlockGym(gymId, newStatus, reason),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useChangePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gymId, planTier, reason }: { gymId: string; planTier: string; reason: string }) =>
      adminService.changePlan(gymId, planTier, reason),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useActivateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gymId }: { gymId: string }) =>
      adminService.activateSubscription(gymId),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteGym() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gymId, confirmName, reason }: { gymId: string; confirmName: string; reason: string }) =>
      adminService.deleteGym(gymId, confirmName, reason),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useImpersonateGymOwner() {
  return useMutation({
    mutationFn: ({ gymId }: { gymId: string }) =>
      adminService.impersonateGymOwner(gymId),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof adminService.updateSettings>[0]) =>
      adminService.updateSettings(data),
    onSuccess: () => {
      toast.success("Platform settings updated");
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
