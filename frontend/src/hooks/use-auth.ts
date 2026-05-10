"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";
import { authService } from "@/services/auth.service";
import axios from "axios";

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

    // Skip /auth/me if profile was already fetched (prevents duplicate calls
    // when multiple components mount useAuth simultaneously)
    if (state._profileFetched) return;
    store.markProfileFetched();

    // Validate session with server — the HttpOnly cookie is sent automatically.
    // If no valid cookie exists, the server returns 401 and we stay logged out.
    authService
      .getMe()
      .then((profile) => {
        store.setUser(profile);
      })
      .catch((err) => {
        // 401 = no valid session cookie → not authenticated
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          store.logout();
          return;
        }
        // Network/server errors: can't determine auth state, stop loading
        store.setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return store;
}
