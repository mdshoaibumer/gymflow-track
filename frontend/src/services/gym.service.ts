import { request } from "@/lib/api";

export interface Gym {
  id: string;
  name: string;
  slug: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  logo_url: string | null;
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

  uploadLogo: async (file: File): Promise<Gym> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/v1/gyms/me/logo", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(err.detail || "Upload failed");
    }
    return res.json();
  },

  deleteLogo: () =>
    request.delete<Gym>("/gyms/me/logo"),
};
