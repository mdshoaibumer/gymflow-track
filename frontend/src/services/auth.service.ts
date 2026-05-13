import { request } from "@/lib/api";

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
  role: "super_admin" | "owner" | "admin" | "staff";
  is_active: boolean;
}

let getMePromise: Promise<CurrentUserResponse> | null = null;

export const authService = {
  /**
   * Authenticates a user with email and password.
   * Server sets HttpOnly cookies in the response — no manual token handling needed.
   */
  login: (data: LoginPayload) =>
    request.post<TokenResponse>("/auth/login", data),

  /**
   * Registers a new gym and its owner.
   * Server sets HttpOnly cookies in the response.
   */
  register: (data: RegisterPayload) =>
    request.post<TokenResponse>("/auth/register", data),

  /**
   * Refreshes the access token using the HttpOnly refresh cookie.
   * No body payload needed — the cookie is sent automatically by the browser.
   */
  refresh: () =>
    request.post<TokenResponse>("/auth/refresh"),

  /** 
   * Validates the current session via HttpOnly cookie and retrieves the user profile.
   * Deduplicates concurrent calls to prevent redundant network requests.
   */
  getMe: () => {
    if (!getMePromise) {
      getMePromise = request.get<CurrentUserResponse>("/auth/me").finally(() => {
        getMePromise = null;
      });
    }
    return getMePromise;
  },

  /**
   * Logs out the current session. Server clears HttpOnly cookies.
   */
  logout: () =>
    request.post<{ message: string }>("/auth/logout"),

  /**
   * Initiates the forgot password flow by sending a reset link to the provided email.
   */
  forgotPassword: (email: string) =>
    request.post<{ message: string }>("/auth/forgot-password", { email }),

  /**
   * Resets the user's password using a reset token.
   */
  resetPassword: (token: string, new_password: string) =>
    request.post<{ message: string }>("/auth/reset-password", { token, new_password }),
};
