"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { billingService } from "@/services/billing.service";
import { useAuthStore } from "@/store/auth-store";

const keys = {
  all: ["billing"] as const,
  plans: () => [...keys.all, "plans"] as const,
  subscription: () => [...keys.all, "subscription"] as const,
  history: () => [...keys.all, "history"] as const,
  features: () => [...keys.all, "features"] as const,
  metrics: () => [...keys.all, "metrics"] as const,
};

export function usePlans() {
  return useQuery({
    queryKey: keys.plans(),
    queryFn: () => billingService.getPlans(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSubscription(enabled = true) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const isOwner = role === "owner";

  return useQuery({
    queryKey: keys.subscription(),
    queryFn: () => billingService.getSubscription(),
    enabled: !!token && isOwner && enabled,
    staleTime: 60 * 1000,
  });
}

export function useBillingHistory(enabled = true) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const isOwner = role === "owner";

  return useQuery({
    queryKey: keys.history(),
    queryFn: () => billingService.getHistory(),
    enabled: !!token && isOwner && enabled,
  });
}

export function useFeatureLimits() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.features(),
    queryFn: () => billingService.getFeatureLimits(),
    enabled: !!token,
    staleTime: 60 * 1000,
  });
}

export function useBillingMetrics() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const isOwner = role === "owner";

  return useQuery({
    queryKey: keys.metrics(),
    queryFn: () => billingService.getMetrics(),
    enabled: !!token && isOwner,
  });
}

export function useSubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planTier: string) => billingService.subscribe(planTier),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.subscription() });
    },
    onError: () => {
      toast.error("Failed to start subscription");
    },
  });
}

export function useVerifyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }) => billingService.verifyPayment(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.subscription() });
      qc.invalidateQueries({ queryKey: keys.history() });
      toast.success("Payment verified! Subscription activated.");
    },
    onError: () => {
      toast.error("Payment verification failed");
    },
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => billingService.cancel(reason),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: keys.subscription() });
      toast.success(data.message || "Subscription cancelled");
    },
    onError: () => {
      toast.error("Failed to cancel subscription");
    },
  });
}
