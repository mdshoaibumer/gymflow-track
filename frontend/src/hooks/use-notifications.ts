"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { notificationService, type ListNotificationsParams } from "@/services/notification.service";
import { toast } from "sonner";

export function useNotifications(params: ListNotificationsParams = {}) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["notifications", params],
    queryFn: () => notificationService.list(token!, params),
    enabled: !!token,
    staleTime: 15_000,
  });
}

export function useNotificationStats() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["notifications", "stats"],
    queryFn: () => notificationService.stats(token!),
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useTriggerScan() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.triggerScan(token!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(`${data.reminders_scheduled} reminders scheduled`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useCancelNotification() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationService.cancel(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Notification cancelled");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useRetryFailed() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.retryFailed(token!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(`${data.reminders_scheduled} retries scheduled`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
