import { apiClient } from "@/lib/api";
import type { UserRole } from "@/types";

// --- Types ---

export interface StaffUser {
  id: string;
  gym_id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserPayload {
  name?: string;
  phone?: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface ListUsersParams {
  skip?: number;
  limit?: number;
}

// --- Service ---

export const userService = {
  list: (params: ListUsersParams = {}) => {
    const { skip = 0, limit = 50 } = params;
    const query = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    return apiClient<StaffUser[]>(`/users?${query}`);
  },

  create: (data: CreateUserPayload) =>
    apiClient<StaffUser>("/users", { method: "POST", body: data }),

  update: (id: string, data: UpdateUserPayload) =>
    apiClient<StaffUser>(`/users/${id}`, { method: "PUT", body: data }),

  deactivate: (id: string) =>
    apiClient<StaffUser>(`/users/${id}/deactivate`, { method: "POST" }),
};
