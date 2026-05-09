import { apiClient } from "@/lib/api";

export interface Gym {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  is_active: boolean;
}

export interface GymUpdatePayload {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
}

export const gymService = {
  getMyGym: (token: string) =>
    apiClient<Gym>("/gyms/me", { token }),

  updateMyGym: (token: string, data: GymUpdatePayload) =>
    apiClient<Gym>("/gyms/me", { method: "PATCH", body: data, token }),
};
