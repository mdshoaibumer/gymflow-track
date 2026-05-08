"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { UserRole } from "@/types";
import { authService, type CurrentUserResponse } from "@/services/auth.service";
import { onAuthRefreshed } from "@/lib/api";

const TOKEN_KEY = "gymflow_access_token";
const REFRESH_KEY = "gymflow_refresh_token";

/**
 * Decode a JWT payload without verifying signature.
 * Safe for client-side role extraction — the server is the authority.
 */
function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Check if a JWT is expired (with 60s buffer for clock skew). */
function isTokenExpired(token: string): boolean {
  const payload = decodePayload(token);
  if (!payload || typeof payload.exp !== "number") return true;
  return payload.exp * 1000 < Date.now() - 60_000;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<CurrentUserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * On mount: read token from localStorage, validate it hasn't expired,
   * then verify server-side with /auth/me.
   *
   * Why server validation:
   * - User could have been disabled since the token was issued
   * - Token could be from a different deployment/secret rotation
   * - Provides fresh user data for the session
   */
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored || isTokenExpired(stored)) {
      // Token missing or expired — clear state and stop loading
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      setIsLoading(false);
      return;
    }

    setToken(stored);
    setIsAuthenticated(true);

    // Validate token server-side
    authService
      .getMe(stored)
      .then((profile) => {
        setUser(profile);
      })
      .catch(() => {
        // Token rejected by server — clear everything
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setToken(null);
        setIsAuthenticated(false);
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const role: UserRole | null = useMemo(() => {
    if (user) return user.role;
    if (!token) return null;
    const payload = decodePayload(token);
    if (!payload || typeof payload.role !== "string") return null;
    return payload.role as UserRole;
  }, [token, user]);

  // Listen for transparent token refresh events from the API client
  useEffect(() => {
    return onAuthRefreshed((e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.accessToken) {
        setToken(detail.accessToken);
        setIsAuthenticated(true);
        // Refresh user profile with new token
        authService.getMe(detail.accessToken).then(setUser).catch(() => {});
      }
    });
  }, []);

  const saveTokens = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    setToken(accessToken);
    setIsAuthenticated(true);
    setIsLoading(false);

    // Fetch user profile in background
    authService.getMe(accessToken).then(setUser).catch(() => {});
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setToken(null);
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  /**
   * Role-checking helpers for conditional UI rendering.
   * These control VISIBILITY only — the server enforces actual access.
   */
  const isOwner = role === "owner";
  const isAdminOrAbove = role === "owner" || role === "admin";

  return {
    token,
    isAuthenticated,
    isLoading,
    user,
    role,
    isOwner,
    isAdminOrAbove,
    saveTokens,
    logout,
  };
}
