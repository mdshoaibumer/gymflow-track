import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const TOKEN_KEY = "gymflow_access_token";
export const REFRESH_KEY = "gymflow_refresh_token";

/** Custom events for auth state communication */
export const AUTH_EXPIRED_EVENT = "gymflow:auth-expired";
export const AUTH_REFRESHED_EVENT = "gymflow:auth-refreshed";

export function onAuthExpired(callback: () => void): () => void {
  window.addEventListener(AUTH_EXPIRED_EVENT, callback);
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, callback);
}

export function onAuthRefreshed(callback: (e: Event) => void): () => void {
  window.addEventListener(AUTH_REFRESHED_EVENT, callback);
  return () => window.removeEventListener(AUTH_REFRESHED_EVENT, callback);
}

// ---------- Axios Instance ----------

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// Request interceptor — attach token from localStorage
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor — auto-refresh on 401, normalize errors
let _refreshPromise: Promise<string | null> | null = null;

async function _attemptTokenRefresh(): Promise<string | null> {
  const refreshToken = typeof window !== "undefined"
    ? localStorage.getItem(REFRESH_KEY)
    : null;
  if (!refreshToken) return null;

  try {
    const response = await axios.post(`${API_URL}/auth/refresh`, {
      refresh_token: refreshToken,
    });

    const data = response.data;
    if (data.access_token && data.refresh_token) {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(REFRESH_KEY, data.refresh_token);

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

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ detail?: string }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 401 — attempt transparent token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!_refreshPromise) {
        _refreshPromise = _attemptTokenRefresh().finally(() => {
          _refreshPromise = null;
        });
      }
      const newToken = await _refreshPromise;

      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
      return Promise.reject(new Error("Session expired. Please log in again."));
    }

    // Rate limited
    if (error.response?.status === 429) {
      return Promise.reject(new Error("Too many requests. Please wait a moment and try again."));
    }

    // Extract error detail
    const detail = error.response?.data?.detail;
    if (detail) {
      return Promise.reject(new Error(detail));
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
  token?: string;
  _skipRefresh?: boolean;
};

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, token } = options;

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await api.request<T>({
    url: endpoint,
    method,
    data: body,
    headers,
  });

  return response.data;
}
