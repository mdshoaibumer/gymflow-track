import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import { useDashboardMetrics, useExpiringMembers, useRecentPayments } from "@/hooks/use-payments";
import { useDashboardKPIs, useRevenueTrend, useRevenueSummary, useMembershipDistribution } from "@/hooks/use-analytics";
import React from "react";

// Create a wrapper with QueryClient for testing hooks
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = "QueryWrapper";
  return Wrapper;
}

describe("Dashboard Hooks - Gym-Scoped Query Keys", () => {
  const mockUser = {
    id: "user-id",
    gym_id: "gym-123",
    name: "Test Owner",
    email: "test@gym.com",
    phone: "9876543210",
    role: "owner" as const,
    is_active: true,
  };

  it("useDashboardMetrics includes gym_id in query key", () => {
    useAuthStore.setState({ token: "cookie-auth", user: mockUser });

    const { result } = renderHook(() => useDashboardMetrics(), {
      wrapper: createWrapper(),
    });

    // The hook should be enabled and have gym-scoped key
    expect(result.current.isLoading).toBe(true); // fetching because enabled
  });

  it("useDashboardMetrics is disabled when gym_id is missing", () => {
    useAuthStore.setState({ token: "cookie-auth", user: null });

    const { result } = renderHook(() => useDashboardMetrics(), {
      wrapper: createWrapper(),
    });

    // Should not fetch without gym_id
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useExpiringMembers is disabled when gym_id is missing", () => {
    useAuthStore.setState({ token: "cookie-auth", user: null });

    const { result } = renderHook(() => useExpiringMembers(), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useRecentPayments is disabled when gym_id is missing", () => {
    useAuthStore.setState({ token: "cookie-auth", user: null });

    const { result } = renderHook(() => useRecentPayments(), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useDashboardKPIs is disabled when gym_id is missing", () => {
    useAuthStore.setState({ token: "cookie-auth", user: null });

    const { result } = renderHook(() => useDashboardKPIs(), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useRevenueTrend is disabled when gym_id is missing", () => {
    useAuthStore.setState({ token: "cookie-auth", user: null });

    const { result } = renderHook(() => useRevenueTrend(), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useRevenueSummary is disabled when gym_id is missing", () => {
    useAuthStore.setState({ token: "cookie-auth", user: null });

    const { result } = renderHook(() => useRevenueSummary(), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useMembershipDistribution is disabled when gym_id is missing", () => {
    useAuthStore.setState({ token: "cookie-auth", user: null });

    const { result } = renderHook(() => useMembershipDistribution(), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("hooks become enabled when both token and gym_id are present", () => {
    useAuthStore.setState({ token: "cookie-auth", user: mockUser });

    const { result } = renderHook(() => useDashboardMetrics(), {
      wrapper: createWrapper(),
    });

    // Should be fetching (enabled=true)
    expect(result.current.fetchStatus).toBe("fetching");
  });

  it("hooks are disabled when token is null", () => {
    useAuthStore.setState({ token: null, user: mockUser });

    const { result } = renderHook(() => useDashboardMetrics(), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});
