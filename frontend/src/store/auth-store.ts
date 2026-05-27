/**
 * @file auth-store.ts
 * @description Zustand store for authentication state.
 *              Manages session lifecycle with HttpOnly cookie-based tokens.
 * @author Mohammed Shoaib U
 * @module store/auth-store
 */

import { create } from "zustand";
import type { CurrentUserResponse } from "@/services/auth.service";
import type { UserRole } from "@/types";
import { TOKEN_KEY, REFRESH_KEY } from "@/lib/api";
import { getQueryClient } from "@/lib/query-client";

/**
 * Auth store — cookie-based session management.
 *
 * Tokens are stored in HttpOnly cookies (not accessible to JS).
 * Auth state is derived from the /auth/me server response.
 * localStorage is only used for one-time migration cleanup of legacy tokens
 * and cross-tab auth synchronization.
 */

// BroadcastChannel for multi-tab auth sync
const AUTH_CHANNEL_NAME = "gymflow:auth-sync";

type AuthMessage =
  | { type: "logout" }
  | { type: "login"; user: CurrentUserResponse };

let _authChannel: BroadcastChannel | null = null;

function getAuthChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!_authChannel) {
    try {
      _authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
    } catch {
      // BroadcastChannel not supported (e.g., older browsers)
      return null;
    }
  }
  return _authChannel;
}

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
  isSuperAdmin: boolean;

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

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  role: null,
  token: null,
  isOwner: false,
  isAdminOrAbove: false,
  isSuperAdmin: false,
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

    // Set up multi-tab auth sync listener
    const channel = getAuthChannel();
    if (channel) {
      channel.onmessage = (event: MessageEvent<AuthMessage>) => {
        const msg = event.data;
        if (msg.type === "logout") {
          try { getQueryClient().clear(); } catch { /* safe */ }
          set({
            isAuthenticated: false,
            token: null,
            user: null,
            role: null,
            isOwner: false,
            isAdminOrAbove: false,
            isSuperAdmin: false,
            _profileFetched: true,  // Prevent useAuth from re-calling /auth/me
            isLoading: false,
          });
        } else if (msg.type === "login" && msg.user) {
          set({
            user: msg.user,
            isAuthenticated: true,
            token: "cookie-auth",
            role: msg.user.role,
            isOwner: msg.user.role === "owner",
            isAdminOrAbove: msg.user.role === "owner" || msg.user.role === "admin",
            isSuperAdmin: msg.user.role === "super_admin",
            isLoading: false,
            _profileFetched: true,
          });
        }
      };
    }

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
      isSuperAdmin: user.role === "super_admin",
      isLoading: false,
    });

    // Notify other tabs about login
    const channel = getAuthChannel();
    if (channel) {
      try {
        channel.postMessage({ type: "login", user } as AuthMessage);
      } catch { /* channel closed */ }
    }
  },

  setAuthenticated: () => {
    set({ isAuthenticated: true });
  },

  saveTokens: () => {
    // Tokens are now in HttpOnly cookies — browser manages them.
    // This method exists for backward compatibility with login/register pages
    // that call saveTokens after a successful response. We mark as authenticated
    // and RESET _profileFetched so the dashboard's useAuth will call /auth/me
    // to hydrate the full user profile.
    set({
      isAuthenticated: true,
      token: "cookie-auth",  // Sentinel for !!token checks in hooks
      isLoading: true,  // Stay loading until /auth/me completes on dashboard
      _profileFetched: false,  // Allow dashboard to fetch profile
    });
  },

  logout: () => {
    // Clear any residual localStorage (migration safety net)
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }

    // Clear React Query cache to prevent cross-account data leakage
    try {
      getQueryClient().clear();
    } catch { /* safe to ignore during SSR */ }

    // Notify other tabs about logout
    const channel = getAuthChannel();
    if (channel) {
      try {
        channel.postMessage({ type: "logout" } as AuthMessage);
      } catch { /* channel closed */ }
    }

    set({
      isAuthenticated: false,
      token: null,
      user: null,
      role: null,
      isOwner: false,
      isAdminOrAbove: false,
      isSuperAdmin: false,
      _profileFetched: true,  // Prevent useAuth from re-calling /auth/me after logout
      isLoading: false,
    });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  markProfileFetched: () => set({ _profileFetched: true }),
}));
