import { create } from "zustand";
import type { CurrentUserResponse } from "@/services/auth.service";
import type { UserRole, DecodedToken } from "@/types";
import { TOKEN_KEY, REFRESH_KEY } from "@/lib/api";

function decodePayload(token: string): DecodedToken | null {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as DecodedToken;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodePayload(token);
  if (!payload || typeof payload.exp !== "number") return true;
  return payload.exp * 1000 < Date.now() - 60_000;
}

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: CurrentUserResponse | null;
  role: UserRole | null;

  // Computed helpers
  isOwner: boolean;
  isAdminOrAbove: boolean;

  // Actions
  initialize: () => void;
  setUser: (user: CurrentUserResponse) => void;
  saveTokens: (accessToken: string, refreshToken: string) => void;
  updateToken: (accessToken: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  isAuthenticated: false,
  isLoading: true,
  user: null,
  role: null,
  isOwner: false,
  isAdminOrAbove: false,

  initialize: () => {
    if (typeof window === "undefined") {
      set({ isLoading: false });
      return;
    }

    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored || isTokenExpired(stored)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      set({ isLoading: false });
      return;
    }

    const payload = decodePayload(stored);
    const role = payload?.role;

    set({
      token: stored,
      isAuthenticated: true,
      role: role || null,
      isOwner: role === "owner",
      isAdminOrAbove: role === "owner" || role === "admin",
    });
  },

  setUser: (user: CurrentUserResponse) => {
    set({
      user,
      role: user.role,
      isOwner: user.role === "owner",
      isAdminOrAbove: user.role === "owner" || user.role === "admin",
      isLoading: false,
    });
  },

  saveTokens: (accessToken: string, refreshToken: string) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);

    const payload = decodePayload(accessToken);
    const role = payload?.role;

    set({
      token: accessToken,
      isAuthenticated: true,
      isLoading: false,
      role: role || null,
      isOwner: role === "owner",
      isAdminOrAbove: role === "owner" || role === "admin",
    });
  },

  updateToken: (accessToken: string) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    set({ token: accessToken });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    set({
      token: null,
      isAuthenticated: false,
      user: null,
      role: null,
      isOwner: false,
      isAdminOrAbove: false,
    });
  },

  setLoading: (loading: boolean) => set({ isLoading: loading }),
}));
