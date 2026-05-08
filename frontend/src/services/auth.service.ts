import { apiClient } from "@/lib/api";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  gym_name: string;
  owner_name: string;
  phone: string;
  email: string;
  password: string;
  city?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface CurrentUserResponse {
  id: string;
  gym_id: string;
  name: string;
  email: string;
  phone: string;
  role: "owner" | "admin" | "staff";
  is_active: boolean;
}

export const authService = {
  login: (data: LoginPayload) =>
    apiClient<TokenResponse>("/auth/login", { method: "POST", body: data }),

  register: (data: RegisterPayload) =>
    apiClient<TokenResponse>("/auth/register", { method: "POST", body: data }),

  refresh: (refresh_token: string) =>
    apiClient<TokenResponse>("/auth/refresh", {
      method: "POST",
      body: { refresh_token },
    }),

  /** Validate token server-side and get current user profile. */
  getMe: (token: string) =>
    apiClient<CurrentUserResponse>("/auth/me", { token }),
};
