import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAuthStore } from "@/store/auth-store";
import { getQueryClient } from "@/lib/query-client";

// Mock the query client module
vi.mock("@/lib/query-client", () => {
  const mockClear = vi.fn();
  const mockQueryClient = { clear: mockClear };
  return {
    getQueryClient: vi.fn(() => mockQueryClient),
  };
});

describe("AuthStore - Cache Isolation on Logout", () => {
  const mockUserGymA = {
    id: "user-a-id",
    gym_id: "gym-a-id",
    name: "Owner A",
    email: "ownera@gym.com",
    phone: "9876543210",
    role: "owner" as const,
    is_active: true,
  };

  const mockUserGymB = {
    id: "user-b-id",
    gym_id: "gym-b-id",
    name: "Owner B",
    email: "ownerb@gym.com",
    phone: "9876543211",
    role: "owner" as const,
    is_active: true,
  };

  beforeEach(() => {
    // Reset store to initial state
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      role: null,
      token: null,
      isOwner: false,
      isAdminOrAbove: false,
      isSuperAdmin: false,
      _profileFetched: false,
    });
    vi.clearAllMocks();
  });

  it("clears React Query cache on logout to prevent cross-account data leakage", () => {
    const { setUser, logout } = useAuthStore.getState();
    const mockClient = getQueryClient();

    // Simulate login as Gym A
    setUser(mockUserGymA);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.gym_id).toBe("gym-a-id");

    // Logout
    logout();

    // Verify cache was cleared
    expect(mockClient.clear).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("prevents stale data when switching between gym accounts", () => {
    const { setUser, logout } = useAuthStore.getState();
    const mockClient = getQueryClient();

    // Login as Gym A (303 members, 1L revenue in cache)
    setUser(mockUserGymA);
    expect(useAuthStore.getState().user?.gym_id).toBe("gym-a-id");

    // Logout from Gym A
    logout();
    expect(mockClient.clear).toHaveBeenCalledTimes(1);

    // Login as Gym B (2 members)
    setUser(mockUserGymB);
    expect(useAuthStore.getState().user?.gym_id).toBe("gym-b-id");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    // Cache was cleared between sessions — Gym B will fetch fresh data
    expect(mockClient.clear).toHaveBeenCalledTimes(1);
  });

  it("clears all auth state on logout", () => {
    const { setUser, logout } = useAuthStore.getState();

    setUser(mockUserGymA);

    // Verify authenticated state
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().token).toBe("cookie-auth");
    expect(useAuthStore.getState().role).toBe("owner");
    expect(useAuthStore.getState().isOwner).toBe(true);

    logout();

    // Verify complete cleanup
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.role).toBeNull();
    expect(state.isOwner).toBe(false);
    expect(state.isAdminOrAbove).toBe(false);
    expect(state.isSuperAdmin).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it("sets _profileFetched to true on logout to prevent stale /auth/me calls", () => {
    const { setUser, logout } = useAuthStore.getState();

    setUser(mockUserGymA);
    logout();

    expect(useAuthStore.getState()._profileFetched).toBe(true);
  });

  it("saveTokens resets _profileFetched to allow fresh profile fetch on new login", () => {
    const { logout, saveTokens } = useAuthStore.getState();

    logout();
    expect(useAuthStore.getState()._profileFetched).toBe(true);

    // New login triggers saveTokens
    saveTokens("", "");
    expect(useAuthStore.getState()._profileFetched).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().token).toBe("cookie-auth");
  });
});
