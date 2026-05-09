import { apiClient, api } from "@/lib/api";

// === Onboarding ===

export interface OnboardingStatus {
  gym_name: string;
  has_members: boolean;
  member_count: number;
  has_attendance: boolean;
  has_payments: boolean;
  has_equipment: boolean;
  onboarding_complete: boolean;
}

export interface DemoDataResult {
  members_created: number;
  payments_created: number;
  equipment_created: number;
}

export interface ImportRowPreview {
  row_number: number;
  name: string;
  phone: string;
  email: string | null;
  membership_plan: string | null;
  membership_start: string | null;
  membership_end: string | null;
  status: "valid" | "duplicate" | "invalid";
  errors: string[];
}

export interface ImportPreview {
  total_rows: number;
  valid: number;
  duplicates: number;
  invalid: number;
  rows: ImportRowPreview[];
}

export interface ImportResult {
  imported: number;
  skipped_duplicates: number;
  skipped_invalid: number;
  errors: string[];
}

// === Feedback ===

export interface FeedbackPayload {
  category: "bug" | "feature" | "friction" | "general";
  message: string;
  page?: string;
}

// === Pilot Metrics ===

export interface PilotMetrics {
  total_members: number;
  active_members: number;
  members_added_this_week: number;
  payments_this_month: number;
  attendance_today: number;
  attendance_this_week: number;
  notifications_sent: number;
  notifications_failed: number;
  equipment_count: number;
  feedback_count: number;
}

export const onboardingService = {
  getStatus: (token: string) =>
    apiClient<OnboardingStatus>("/onboarding/status", { token }),

  seedDemoData: (token: string, options?: { member_count?: number }) =>
    apiClient<DemoDataResult>("/onboarding/demo-data", {
      method: "POST",
      body: {
        include_members: true,
        include_payments: true,
        include_equipment: true,
        member_count: options?.member_count ?? 15,
      },
      token,
    }),

  previewImport: async (token: string, file: File): Promise<ImportPreview> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await api.post<ImportPreview>(
      "/onboarding/import/preview",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  },

  commitImport: async (
    token: string,
    file: File,
    options?: { skip_duplicates?: boolean; skip_invalid?: boolean }
  ): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append("file", file);

    const params = new URLSearchParams({
      skip_duplicates: String(options?.skip_duplicates ?? true),
      skip_invalid: String(options?.skip_invalid ?? true),
    });

    const response = await api.post<ImportResult>(
      `/onboarding/import/upload?${params}`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  },

  submitFeedback: (token: string, data: FeedbackPayload) =>
    apiClient<{ id: string }>("/feedback", {
      method: "POST",
      body: data,
      token,
    }),

  getMetrics: (token: string) =>
    apiClient<PilotMetrics>("/admin/metrics", { token }),
};
