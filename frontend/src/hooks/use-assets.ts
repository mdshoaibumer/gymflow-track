"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  assetService,
  type ListAssetsParams,
  type CreateAssetPayload,
  type CreateMaintenancePayload,
  type AssetStatus,
} from "@/services/asset.service";
import { useAuthStore } from "@/store/auth-store";

const keys = {
  all: ["assets"] as const,
  list: (params?: ListAssetsParams) => [...keys.all, "list", params] as const,
  stats: () => [...keys.all, "stats"] as const,
  maintenance: (assetId: string) => [...keys.all, "maintenance", assetId] as const,
};

export function useAssets(params: ListAssetsParams = {}) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => assetService.list(params),
    enabled: !!token,
  });
}

export function useAssetStats() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.stats(),
    queryFn: () => assetService.stats(),
    enabled: !!token,
  });
}

export function useMaintenanceHistory(assetId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.maintenance(assetId),
    queryFn: () => assetService.getMaintenanceHistory(assetId),
    enabled: !!token && !!assetId,
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAssetPayload) => assetService.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      toast.success("Equipment added");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateAssetPayload> }) =>
      assetService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      toast.success("Equipment updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateAssetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AssetStatus }) =>
      assetService.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      toast.success("Status updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCompleteMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assetService.completeMaintenance(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      toast.success("Maintenance completed");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRecordMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, data }: { assetId: string; data: CreateMaintenancePayload }) =>
      assetService.recordMaintenance(assetId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      toast.success("Maintenance recorded");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
