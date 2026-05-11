"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import {
  memberService,
  type ListMembersParams,
  type CreateMemberPayload,
} from "@/services/member.service";
import { toast } from "sonner";

// ---- Multi-tab sync via BroadcastChannel ----
// When a user opens the members page in two browser tabs and edits in one,
// the other tab auto-refreshes its data. This prevents stale-data confusion
// without requiring WebSockets or polling.
const CHANNEL_NAME = "gymflow:member-sync";
type MemberSyncMessage = { type: "member-mutation"; timestamp: number };

let _channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!_channel) {
    try {
      _channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      // BroadcastChannel not supported (e.g. SSR, very old browser)
      return null;
    }
  }
  return _channel;
}

function broadcastMemberMutation() {
  const ch = getChannel();
  ch?.postMessage({ type: "member-mutation", timestamp: Date.now() } satisfies MemberSyncMessage);
}

/**
 * Hook to listen for member mutations in other tabs and invalidate queries.
 * Call this once in the members page component.
 */
export function useMemberTabSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const ch = getChannel();
    if (!ch) return;

    const handler = (event: MessageEvent<MemberSyncMessage>) => {
      if (event.data?.type === "member-mutation") {
        queryClient.invalidateQueries({ queryKey: ["members"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
    };

    ch.addEventListener("message", handler);
    return () => {
      ch.removeEventListener("message", handler);
    };
  }, [queryClient]);
}

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
      broadcastMemberMutation();
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      broadcastMemberMutation();
      toast.success("Member updated successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useDeleteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => memberService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      broadcastMemberMutation();
      toast.success("Member removed successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
