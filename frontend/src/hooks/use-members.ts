"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import {
  memberService,
  type ListMembersParams,
  type CreateMemberPayload,
} from "@/services/member.service";
import { toast } from "sonner";

export function useMembers(
  params: ListMembersParams = {},
  options?: { enabled?: boolean }
) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["members", params],
    queryFn: () => memberService.list(params),
    enabled: !!token && (options?.enabled ?? true),
    staleTime: 15_000,
  });
}

export function useMember(id: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["members", id],
    queryFn: () => memberService.get(id),
    enabled: !!token && !!id,
    staleTime: 30_000,
  });
}

export function useCreateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMemberPayload) =>
      memberService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Member added successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateMemberPayload }) =>
      memberService.replace(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success("Member updated successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useDeleteMember() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => memberService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Member removed successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
