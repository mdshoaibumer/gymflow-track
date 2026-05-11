import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// Legacy localStorage keys — used only for one-time cleanup during migration
// to HttpOnly cookie auth. auth-store.ts removes these on initialize().
export const TOKEN_KEY = "gymflow_access_token";
export const REFRESH_KEY = "gymflow_refresh_token";

export const AUTH_EXPIRED_EVENT = "gymflow:auth-expired";

export function onAuthExpired(callback: () => void): () => void {
  window.addEventListener(AUTH_EXPIRED_EVENT, callback);
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, callback);
}

// ---------- Axios Instance ----------

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
  // CRITICAL: withCredentials sends HttpOnly cookies with every request.
  // This replaces manual Authorization header management for browser clients.
  withCredentials: true,
});

// Request interceptor — no-op for cookie auth, but kept for backward compat
// with any code that still sets Authorization manually.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Cookies are sent automatically by the browser — no manual header needed.
  // Legacy localStorage tokens are no longer read here.
  return config;
});

// Response interceptor — auto-refresh on 401, normalize errors
let _refreshPromise: Promise<boolean> | null = null;

async function _attemptTokenRefresh(): Promise<boolean> {
  try {
    // POST to /auth/refresh — the refresh token is in an HttpOnly cookie,
    // sent automatically by the browser (withCredentials: true).
    await axios.post(
      `${API_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    return true;
  } catch {
    return false;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ detail?: string | Array<{ msg?: string }> }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const isAuthRoute = originalRequest.url?.includes("/auth/login") || originalRequest.url?.includes("/auth/register");
    const isAuthMeRoute = originalRequest.url?.includes("/auth/me");
    
    // 401 — attempt transparent token refresh (unless it's an auth route where 401 means invalid credentials)
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;

      if (!_refreshPromise) {
        _refreshPromise = _attemptTokenRefresh().finally(() => {
          _refreshPromise = null;
        });
      }
      const refreshed = await _refreshPromise;

      if (refreshed) {
        // Retry original request — new access token is in the cookie
        return api(originalRequest);
      }

      // Don't fire AUTH_EXPIRED_EVENT for /auth/me — it's used for session
      // validation on page load and a 401 just means "not logged in yet".
      if (!isAuthMeRoute && typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
      return Promise.reject(new Error("Session expired. Please log in again."));
    }

    // Rate limited — surface the server's specific retry timing to the user
    // (e.g. "Too many login attempts. Please try again in 60 seconds.")
    if (error.response?.status === 429) {
      const retryDetail = error.response?.data?.detail;
      const retryMsg = typeof retryDetail === "string" ? retryDetail : "Too many requests. Please wait a moment and try again.";
      return Promise.reject(new Error(retryMsg));
    }

    // Extract error detail — handle both string and array formats
    const detail = error.response?.data?.detail;
    if (detail) {
      if (typeof detail === "string") {
        return Promise.reject(new Error(detail));
      }
      // FastAPI validation errors return detail as array of objects
      if (Array.isArray(detail)) {
        const messages = detail
          .map((d) => (typeof d === "object" && d !== null && "msg" in d ? d.msg : String(d)))
          .join("; ");
        return Promise.reject(new Error(messages || "Validation error"));
      }
      // Fallback for unexpected object shapes
      return Promise.reject(new Error(String(detail)));
    }

    if (!error.response) {
      return Promise.reject(new Error("Network error — please check your connection."));
    }

    return Promise.reject(new Error(`HTTP ${error.response.status}`));
  }
);

// ---------- Legacy apiClient (kept for backward compat during migration) ----------

type RequestOptions = {
  method?: string;
  body?: unknown;
  _skipRefresh?: boolean;
};

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body } = options;

  const response = await api.request<T>({
    url: endpoint,
    method,
    data: body,
  });

  return response.data;
}
