import { create } from "zustand";
import type { CurrentUserResponse } from "@/services/auth.service";
import type { UserRole } from "@/types";
import { TOKEN_KEY, REFRESH_KEY } from "@/lib/api";

/**
 * Auth store — cookie-based session management.
 *
 * Tokens are stored in HttpOnly cookies (not accessible to JS).
 * Auth state is derived from the /auth/me server response.
 * localStorage is only used for one-time migration cleanup of legacy tokens.
 */

interface AuthState {
  // Session state — derived from /auth/me server response
  isAuthenticated: boolean;
  isLoading: boolean;
  user: CurrentUserResponse | null;
  role: UserRole | null;

  // Backward compat: hooks use !!token as an enabled guard for react-query.
  // Set to a truthy sentinel when authenticated, null otherwise.
  // The actual JWT is in an HttpOnly cookie (not accessible to JS).
  token: string | null;

  // Computed helpers
  isOwner: boolean;
  isAdminOrAbove: boolean;

  // Tracks whether the /auth/me profile fetch has been initiated
  _profileFetched: boolean;

  // Actions
  initialize: () => void;
  setUser: (user: CurrentUserResponse) => void;
  setAuthenticated: () => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  markProfileFetched: () => void;

  // Legacy compat — called by login/register pages after successful auth.
  // Tokens are now in HttpOnly cookies; this just triggers state update.
  saveTokens: (accessToken: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  role: null,
  token: null,
  isOwner: false,
  isAdminOrAbove: false,
  _profileFetched: false,

  initialize: () => {
    if (typeof window === "undefined") {
      set({ isLoading: false });
      return;
    }

    // Clean up legacy localStorage tokens (one-time migration).
    // Tokens are now managed via HttpOnly cookies.
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);

    // Auth state will be determined by the /auth/me call in useAuth hook.
    // We stay in loading state until that call completes.
  },

  setUser: (user: CurrentUserResponse) => {
    set({
      user,
      isAuthenticated: true,
      token: "cookie-auth",  // Sentinel for !!token checks in hooks
      role: user.role,
      isOwner: user.role === "owner",
      isAdminOrAbove: user.role === "owner" || user.role === "admin",
      isLoading: false,
    });
  },

  setAuthenticated: () => {
    set({ isAuthenticated: true });
  },

  saveTokens: (_accessToken: string, _refreshToken: string) => {
    // Tokens are now in HttpOnly cookies — browser manages them.
    // This method exists for backward compatibility with login/register pages
    // that call saveTokens after a successful response. We just mark as authenticated
    // and let the subsequent /auth/me call hydrate the full profile.
    set({
      isAuthenticated: true,
      token: "cookie-auth",  // Sentinel for !!token checks in hooks
      isLoading: false,
    });
  },

  logout: () => {
    // Clear any residual localStorage (migration safety net)
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }
    set({
      isAuthenticated: false,
      token: null,
      user: null,
      role: null,
      isOwner: false,
      isAdminOrAbove: false,
      _profileFetched: false,
      isLoading: false,
    });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  markProfileFetched: () => set({ _profileFetched: true }),
}));
