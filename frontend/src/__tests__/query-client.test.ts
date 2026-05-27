import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";

describe("QueryClient Singleton", () => {
  it("returns the same instance on multiple calls", () => {
    const client1 = getQueryClient();
    const client2 = getQueryClient();
    expect(client1).toBe(client2);
  });

  it("returns a valid QueryClient instance", () => {
    const client = getQueryClient();
    expect(client).toBeInstanceOf(QueryClient);
  });

  it("has correct default options configured", () => {
    const client = getQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.mutations?.retry).toBe(0);
  });

  it("clear() removes all cached query data", () => {
    const client = getQueryClient();

    // Set some mock data in the cache
    client.setQueryData(["dashboard", "metrics", "gym-a"], {
      active_members: 303,
      revenue: 100000,
    });
    client.setQueryData(["analytics", "dashboard-kpis", {}, "gym-a"], {
      total_revenue: 100000,
    });

    // Verify data is cached
    expect(client.getQueryData(["dashboard", "metrics", "gym-a"])).toBeDefined();
    expect(client.getQueryData(["analytics", "dashboard-kpis", {}, "gym-a"])).toBeDefined();

    // Clear all cache
    client.clear();

    // Verify cache is empty
    expect(client.getQueryData(["dashboard", "metrics", "gym-a"])).toBeUndefined();
    expect(client.getQueryData(["analytics", "dashboard-kpis", {}, "gym-a"])).toBeUndefined();
  });

  it("gym-scoped query keys prevent cross-account cache hits", () => {
    const client = getQueryClient();

    // Gym A data
    client.setQueryData(["dashboard", "metrics", "gym-a-id"], {
      active_members: 303,
      revenue: 100000,
    });

    // Gym B should not see Gym A's data (different key)
    const gymBData = client.getQueryData(["dashboard", "metrics", "gym-b-id"]);
    expect(gymBData).toBeUndefined();

    // Gym A data is still accessible with correct key
    const gymAData = client.getQueryData(["dashboard", "metrics", "gym-a-id"]);
    expect(gymAData).toEqual({
      active_members: 303,
      revenue: 100000,
    });

    // Cleanup
    client.clear();
  });
});
