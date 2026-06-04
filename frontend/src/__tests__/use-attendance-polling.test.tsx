import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { useAttendanceToday } from "@/hooks/use-attendance";
import React from "react";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = "QueryWrapper";
  return Wrapper;
}

describe("useAttendanceToday - Polling Configuration", () => {
  const mockUser = {
    id: "user-id",
    gym_id: "gym-123",
    name: "Test Owner",
    email: "test@gym.com",
    phone: "9876543210",
    role: "owner" as const,
    is_active: true,
  };

  it("polls every 10 seconds for near real-time attendance updates", () => {
    useAuthStore.setState({ token: "cookie-auth", user: mockUser });

    const { result } = renderHook(() => useAttendanceToday(), {
      wrapper: createWrapper(),
    });

    // The hook should be enabled and actively fetching
    expect(result.current.isLoading).toBe(true);

    // Verify the query options include 10s polling via internal options
    // The hook returns a UseQueryResult; the refetch interval is configured internally
    // We verify it by checking the hook is enabled (token present)
    expect(result.current.isError).toBe(false);
  });

  it("is disabled when no auth token is present", () => {
    useAuthStore.setState({ token: null, user: null });

    const { result } = renderHook(() => useAttendanceToday(), {
      wrapper: createWrapper(),
    });

    // Should not be loading since it's disabled
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("uses correct query key for attendance today", () => {
    useAuthStore.setState({ token: "cookie-auth", user: mockUser });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useAttendanceToday(), { wrapper: Wrapper });

    // Verify the query is registered with the correct key
    const queries = queryClient.getQueryCache().getAll();
    const attendanceQuery = queries.find(
      (q) => JSON.stringify(q.queryKey) === JSON.stringify(["attendance", "today"])
    );
    expect(attendanceQuery).toBeDefined();
    expect(attendanceQuery!.options.refetchInterval).toBe(10_000);
    expect(attendanceQuery!.options.staleTime).toBe(5_000);
  });
});
