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

let getMePromise: Promise<CurrentUserResponse> | null = null;

export const authService = {
  /**
   * Authenticates a user with email and password.
   * @param data - The login credentials (email and password).
   * @returns A promise resolving to the token response (access and refresh tokens).
   */
  login: (data: LoginPayload) =>
    apiClient<TokenResponse>("/auth/login", { method: "POST", body: data }),

  /**
   * Registers a new gym and its owner.
   * @param data - The registration details.
   * @returns A promise resolving to the token response.
   */
  register: (data: RegisterPayload) =>
    apiClient<TokenResponse>("/auth/register", { method: "POST", body: data }),

  /**
   * Refreshes the access token using a refresh token.
   * @param refresh_token - The refresh token.
   * @returns A promise resolving to the new token response.
   */
  refresh: (refresh_token: string) =>
    apiClient<TokenResponse>("/auth/refresh", {
      method: "POST",
      body: { refresh_token },
    }),

  /** 
   * Validates the current token server-side and retrieves the user profile.
   * Deduplicates concurrent calls to prevent redundant network requests.
   * @returns A promise resolving to the current user's profile information.
   */
  getMe: () => {
    if (!getMePromise) {
      getMePromise = apiClient<CurrentUserResponse>("/auth/me").finally(() => {
        getMePromise = null;
      });
    }
    return getMePromise;
  },

  /**
   * Initiates the forgot password flow by sending a reset link to the provided email.
   * @param email - The user's email address.
   * @returns A promise resolving to a success message.
   */
  forgotPassword: (email: string) =>
    apiClient<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: { email },
    }),

  /**
   * Resets the user's password using a reset token.
   * @param token - The password reset token from the email.
   * @param new_password - The new password to set.
   * @returns A promise resolving to a success message.
   */
  resetPassword: (token: string, new_password: string) =>
    apiClient<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: { token, new_password },
    }),
};
