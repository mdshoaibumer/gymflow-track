"use client";

import { useState, useEffect, useCallback } from "react";

const TOKEN_KEY = "gymflow_access_token";
const REFRESH_KEY = "gymflow_refresh_token";

export function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      setToken(stored);
      setIsAuthenticated(true);
    }
  }, []);

  const saveTokens = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    setToken(accessToken);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setToken(null);
    setIsAuthenticated(false);
  }, []);

  return { token, isAuthenticated, saveTokens, logout };
}
