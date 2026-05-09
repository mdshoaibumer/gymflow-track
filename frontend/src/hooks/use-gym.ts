"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { gymService, type GymUpdatePayload } from "@/services/gym.service";
import { useAuthStore } from "@/store/auth-store";

const keys = {
  gym: ["gym", "me"] as const,
};

export function useGym() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.gym,
    queryFn: () => gymService.getMyGym(token!),
    enabled: !!token,
  });
}

export function useUpdateGym() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GymUpdatePayload) => gymService.updateMyGym(token!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.gym });
      toast.success("Gym profile updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
