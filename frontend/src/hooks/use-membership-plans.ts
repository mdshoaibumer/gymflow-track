"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchPlans,
  createPlan,
  updatePlanApi,
  deletePlanApi,
  migrateLocalStoragePlans,
  type MembershipPlan,
} from "@/lib/membership-plans";
import { useGym } from "@/hooks/use-gym";
import { useEffect } from "react";

const keys = {
  plans: ["membership-plans"] as const,
};

/**
 * Hook to fetch membership plans from the API.
 * On first load, migrates any localStorage plans to the database.
 */
export function useMembershipPlans() {
  const { data: gym } = useGym();

  const query = useQuery({
    queryKey: keys.plans,
    queryFn: fetchPlans,
    enabled: !!gym,
  });

  // One-time migration from localStorage to database
  useEffect(() => {
    if (gym?.id && query.isSuccess) {
      migrateLocalStoragePlans(gym.id);
    }
  }, [gym?.id, query.isSuccess]);

  return query;
}

export function useCreateMembershipPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<MembershipPlan, "id">) => createPlan(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.plans });
      toast.success("Plan added");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create plan"),
  });
}

export function useUpdateMembershipPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: { id: string } & Partial<Omit<MembershipPlan, "id">>) =>
      updatePlanApi(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.plans });
      toast.success("Plan updated");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update plan"),
  });
}

export function useDeleteMembershipPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePlanApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.plans });
      toast.success("Plan deleted");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete plan"),
  });
}
