import { request } from "@/lib/api";

export interface Gym {
  id: string;
  name: string;
  slug: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  is_active: boolean;
}

export interface GymUpdatePayload {
  name?: string;
  phone?: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
}

export const gymService = {
  /**
   * Retrieves the current user's gym profile.
   * @returns A promise resolving to the gym details.
   */
  getMyGym: () =>
    request.get<Gym>("/gyms/me"),

  /**
   * Updates the current user's gym profile.
   * @param data - The gym update details.
   * @returns A promise resolving to the updated gym details.
   */
  updateMyGym: (data: GymUpdatePayload) =>
    request.patch<Gym>("/gyms/me", data),
};
