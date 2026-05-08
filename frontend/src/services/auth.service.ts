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
};
