"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";
import { authService } from "@/services/auth.service";
import { onAuthRefreshed } from "@/lib/api";

/**
 * Auth hook backed by Zustand store.
 * On mount: validates stored token with server and hydrates user profile.
 */
export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    store.initialize();

    const token = useAuthStore.getState().token;
    if (!token) return;

    authService
      .getMe(token)
      .then((profile) => {
        store.setUser(profile);
      })
      .catch(() => {
        store.logout();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for transparent token refresh events from the API client
  useEffect(() => {
    return onAuthRefreshed((e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.accessToken) {
        store.updateToken(detail.accessToken);
        authService.getMe(detail.accessToken).then(store.setUser).catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return store;
}
