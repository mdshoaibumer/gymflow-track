/**
 * API client for GymFlow backend.
 *
 * Production behavior:
 * - NEXT_PUBLIC_API_URL is baked at build time (standalone Next.js)
 * - 401 responses trigger automatic token refresh before logout
 * - All errors are normalized to Error objects with meaningful messages
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const TOKEN_KEY = "gymflow_access_token";
const REFRESH_KEY = "gymflow_refresh_token";

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
  /** Skip auto-refresh on 401 (used internally to avoid infinite loops) */
  _skipRefresh?: boolean;
};

/** Custom event dispatched on 401 — listened to by useAuth for auto-logout */
const AUTH_EXPIRED_EVENT = "gymflow:auth-expired";
/** Custom event dispatched after successful refresh — useAuth updates state */
const AUTH_REFRESHED_EVENT = "gymflow:auth-refreshed";

export function onAuthExpired(callback: () => void): () => void {
  window.addEventListener(AUTH_EXPIRED_EVENT, callback);
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, callback);
}

export function onAuthRefreshed(callback: (e: Event) => void): () => void {
  window.addEventListener(AUTH_REFRESHED_EVENT, callback);
  return () => window.removeEventListener(AUTH_REFRESHED_EVENT, callback);
}

/** Mutex to prevent multiple concurrent refresh attempts */
let _refreshPromise: Promise<string | null> | null = null;

async function _attemptTokenRefresh(): Promise<string | null> {
  const refreshToken = typeof window !== "undefined"
    ? localStorage.getItem(REFRESH_KEY)
    : null;
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.access_token && data.refresh_token) {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(REFRESH_KEY, data.refresh_token);

      // Notify useAuth to update its state
      if (typeof window !== "undefined") {
        const event = new CustomEvent(AUTH_REFRESHED_EVENT, {
          detail: { accessToken: data.access_token, refreshToken: data.refresh_token },
        });
        window.dispatchEvent(event);
      }
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, token, _skipRefresh = false } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Network error — please check your connection.");
  }

  if (!response.ok) {
    // 401 — attempt transparent token refresh before giving up
    if (response.status === 401 && !_skipRefresh && token) {
      // Use mutex to avoid concurrent refreshes
      if (!_refreshPromise) {
        _refreshPromise = _attemptTokenRefresh().finally(() => {
          _refreshPromise = null;
        });
      }
      const newToken = await _refreshPromise;

      if (newToken) {
        // Retry the original request with the new token
        return apiClient<T>(endpoint, {
          ...options,
          token: newToken,
          _skipRefresh: true,
        });
      }

      // Refresh failed — session is truly expired
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
      throw new Error("Session expired. Please log in again.");
    }

    // Rate limited
    if (response.status === 429) {
      throw new Error("Too many requests. Please wait a moment and try again.");
    }

    // Subscription errors — pass through with clear message
    if (response.status === 403) {
      const error = await response.json().catch(() => ({ detail: "Access denied" }));
      throw new Error(error.detail || "Access denied");
    }

    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  // 204 No Content — no body to parse
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
