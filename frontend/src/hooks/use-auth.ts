"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";
import { authService } from "@/services/auth.service";

/**
 * Auth hook backed by Zustand store + HttpOnly cookies.
 *
 * On mount: calls /auth/me to validate session via cookie.
 * The browser automatically sends the HttpOnly access_token cookie.
 * No tokens are accessible to JavaScript (XSS-safe).
 */
export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    store.initialize();

    const state = useAuthStore.getState();

    // Skip /auth/me if profile was already fetched AND user data exists.
    // This prevents duplicate calls when multiple components mount useAuth,
    // but allows re-fetch after login (where _profileFetched was reset).
    if (state._profileFetched && state.user) return;
    store.markProfileFetched();

    // Validate session with server — the HttpOnly cookie is sent automatically.
    // If no valid cookie exists, the server returns 401 and we stay logged out.
    authService
      .getMe()
      .then((profile) => {
        store.setUser(profile);
      })
      .catch(() => {
        // Any failure (401, network error, interceptor-wrapped error) means
        // we cannot validate the session. Clear auth state and stop loading.
        store.logout();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return store;
}
