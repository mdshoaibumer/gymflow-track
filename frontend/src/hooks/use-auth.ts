"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";
import { authService } from "@/services/auth.service";
import { onAuthRefreshed } from "@/lib/api";
import axios from "axios";

/**
 * Auth hook backed by Zustand store.
 * On mount: validates stored token with server and hydrates user profile.
 */
export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    store.initialize();

    const state = useAuthStore.getState();
    const token = state.token;
    if (!token) return;

    // Skip /auth/me if profile was already fetched (prevents duplicate calls
    // when multiple components mount useAuth simultaneously)
    if (state._profileFetched) return;
    store.markProfileFetched();

    authService
      .getMe(token)
      .then((profile) => {
        store.setUser(profile);
      })
      .catch((err) => {
        // 401 = invalid/expired token → logout
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          store.logout();
          return;
        }
        // Network/server errors: keep auth state from JWT but stop loading spinner
        store.setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for transparent token refresh events from the API client
  useEffect(() => {
    return onAuthRefreshed((e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.accessToken) {
        store.updateToken(detail.accessToken);
        authService
          .getMe(detail.accessToken)
          .then(store.setUser)
          .catch(() => {
            // Profile refresh failed after token refresh — user data may be stale
            // but auth state is still valid from the new token
            store.setLoading(false);
          });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return store;
}
