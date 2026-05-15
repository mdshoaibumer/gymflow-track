import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAuthStore } from "@/store/auth-store";
import type { CurrentUserResponse } from "@/services/auth.service";

const mockOwner: CurrentUserResponse = {
  id: "user-1",
  gym_id: "gym-1",
  name: "Test Owner",
  email: "owner@test.com",
  phone: "9876543210",
  role: "owner",
  is_active: true,
};

const mockAdmin: CurrentUserResponse = {
  id: "user-2",
  gym_id: "gym-1",
  name: "Test Admin",
  email: "admin@test.com",
  phone: "9876543211",
  role: "admin",
  is_active: true,
};

const mockSuperAdmin: CurrentUserResponse = {
  id: "user-3",
  gym_id: "gym-1",
  name: "Super Admin",
  email: "super@test.com",
  phone: "9876543212",
  role: "super_admin",
  is_active: true,
};

describe("useAuthStore", () => {
  beforeEach(() => {
    // Reset store state between tests
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      role: null,
      token: null,
      isOwner: false,
      isAdminOrAbove: false,
      isSuperAdmin: false,
      _profileFetched: false,
    });
    localStorage.clear();
  });

  describe("initial state", () => {
    it("starts unauthenticated and loading", () => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(true);
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
    });
  });

  describe("setUser", () => {
    it("sets owner user with correct role flags", () => {
      useAuthStore.getState().setUser(mockOwner);
      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockOwner);
      expect(state.role).toBe("owner");
      expect(state.isOwner).toBe(true);
      expect(state.isAdminOrAbove).toBe(true);
      expect(state.isSuperAdmin).toBe(false);
      expect(state.token).toBe("cookie-auth");
      expect(state.isLoading).toBe(false);
    });

    it("sets admin user with correct role flags", () => {
      useAuthStore.getState().setUser(mockAdmin);
      const state = useAuthStore.getState();

      expect(state.isOwner).toBe(false);
      expect(state.isAdminOrAbove).toBe(true);
      expect(state.isSuperAdmin).toBe(false);
    });

    it("sets super admin user with correct role flags", () => {
      useAuthStore.getState().setUser(mockSuperAdmin);
      const state = useAuthStore.getState();

      expect(state.isOwner).toBe(false);
      expect(state.isAdminOrAbove).toBe(false);
      expect(state.isSuperAdmin).toBe(true);
    });
  });

  describe("logout", () => {
    it("clears all auth state", () => {
      // First set a user
      useAuthStore.getState().setUser(mockOwner);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      // Then logout
      useAuthStore.getState().logout();
      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.role).toBeNull();
      expect(state.isOwner).toBe(false);
      expect(state.isAdminOrAbove).toBe(false);
      expect(state.isSuperAdmin).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it("cleans up legacy localStorage tokens", () => {
      localStorage.setItem("gymflow_access_token", "old-token");
      localStorage.setItem("gymflow_refresh_token", "old-refresh");

      useAuthStore.getState().logout();

      expect(localStorage.getItem("gymflow_access_token")).toBeNull();
      expect(localStorage.getItem("gymflow_refresh_token")).toBeNull();
    });
  });

  describe("saveTokens", () => {
    it("marks as authenticated and resets profile fetch flag", () => {
      useAuthStore.getState().saveTokens("access", "refresh");
      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.token).toBe("cookie-auth");
      expect(state.isLoading).toBe(true); // Stays loading until /auth/me
      expect(state._profileFetched).toBe(false);
    });
  });

  describe("initialize", () => {
    it("removes legacy localStorage tokens", () => {
      localStorage.setItem("gymflow_access_token", "stale");
      localStorage.setItem("gymflow_refresh_token", "stale");

      useAuthStore.getState().initialize();

      expect(localStorage.getItem("gymflow_access_token")).toBeNull();
      expect(localStorage.getItem("gymflow_refresh_token")).toBeNull();
    });
  });

  describe("setLoading", () => {
    it("updates loading state", () => {
      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);

      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);
    });
  });
});
