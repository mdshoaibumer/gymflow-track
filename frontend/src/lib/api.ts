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
let _hasFailedRefresh = false;

async function _attemptTokenRefresh(): Promise<boolean> {
  try {
    // POST to /auth/refresh — the refresh token is in an HttpOnly cookie,
    // sent automatically by the browser (withCredentials: true).
    await axios.post(
      `${API_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    _hasFailedRefresh = false; // Reset on success
    return true;
  } catch (err) {
    // If we get a 429 during refresh, don't mark as permanently failed
    // but don't retry immediately either.
    if (axios.isAxiosError(err) && err.response?.status !== 429) {
      _hasFailedRefresh = true;
    }
    return false;
  }
}

api.interceptors.response.use(
  (response) => {
    // On any successful response, if it wasn't a refresh, we know the session is valid
    if (!response.config.url?.includes("/auth/refresh")) {
      _hasFailedRefresh = false;
    }
    return response;
  },
  async (error: AxiosError<{ detail?: string | Array<{ msg?: string }> }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const isAuthRoute = originalRequest.url?.includes("/auth/login") || originalRequest.url?.includes("/auth/register");
    const isAuthMeRoute = originalRequest.url?.includes("/auth/me");
    const isRefreshRoute = originalRequest.url?.includes("/auth/refresh");
    
    // 401 — attempt transparent token refresh (unless it's an auth route where 401 means invalid credentials)
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute && !isRefreshRoute) {
      // If we already know the refresh failed recently, don't even try.
      // This prevents the "refresh loop" that triggers 429s.
      if (_hasFailedRefresh) {
        if (!isAuthMeRoute && typeof window !== "undefined") {
          window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
        }
        return Promise.reject(new Error("Session expired."));
      }

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

// ---------- Typed Request Helpers ----------

/**
 * Convenience wrappers around the `api` axios instance that unwrap `response.data`.
 * Use these in service files for clean, type-safe API calls.
 * For multipart/form-data or custom headers, use `api` directly.
 */
export const request = {
  get: <T>(url: string, params?: Record<string, unknown>) =>
    api.get<T>(url, { params }).then((r) => r.data),
  post: <T>(url: string, body?: unknown) =>
    api.post<T>(url, body).then((r) => r.data),
  put: <T>(url: string, body?: unknown) =>
    api.put<T>(url, body).then((r) => r.data),
  patch: <T>(url: string, body?: unknown) =>
    api.patch<T>(url, body).then((r) => r.data),
  delete: <T>(url: string, body?: unknown) =>
    api.delete<T>(url, body ? { data: body } : undefined).then((r) => r.data),
};

/** @deprecated Use `request.get/post/put/patch/delete` instead. Kept for backward compat. */
type RequestOptions = {
  method?: string;
  body?: unknown;
  _skipRefresh?: boolean;
};

/** @deprecated Use `request.get/post/put/patch/delete` instead. Kept for backward compat. */
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
