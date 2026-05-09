"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { attendanceService } from "@/services/attendance.service";
import { toast } from "sonner";

export function useAttendanceToday() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["attendance", "today"],
    queryFn: () => attendanceService.getToday(token!),
    enabled: !!token,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useAttendanceStats() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["attendance", "stats"],
    queryFn: () => attendanceService.getStats(token!),
    enabled: !!token,
    staleTime: 10_000,
  });
}

export function useAttendanceTrend(days = 14) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["attendance", "trend", days],
    queryFn: () => attendanceService.getTrend(token!, days),
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function useMemberAttendance(memberId: string, skip = 0, limit = 30) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["attendance", "member", memberId, skip, limit],
    queryFn: () => attendanceService.getMemberAttendance(token!, memberId, skip, limit),
    enabled: !!token && !!memberId,
  });
}

export function useCheckInQR() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (qrToken: string) =>
      attendanceService.checkInByQR(token!, qrToken),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success(`${data.member_name || "Member"} checked in!`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useCheckInManual() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      attendanceService.checkInManual(token!, memberId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success(`${data.member_name || "Member"} checked in (manual)`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useCheckOut() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attendanceId: string) =>
      attendanceService.checkOut(token!, attendanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Checked out");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
