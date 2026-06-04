import { request, api } from "@/lib/api";

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
  gender: string | null;
  membership_plan: string | null;
  membership_start: string | null;
  membership_end: string | null;
  amount_paid: number | null;
  status: "valid" | "duplicate" | "invalid";
  errors: string[];
}

export interface ImportPreview {
  total_rows: number;
  valid: number;
  duplicates: number;
  invalid: number;
  column_mappings: Array<{
    csv_column: string;
    target_field: string;
    confidence: number;
    match_method: string;
  }>;
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
  getStatus: () =>
    request.get<OnboardingStatus>("/onboarding/status"),

  seedDemoData: (options?: { member_count?: number }) =>
    request.post<DemoDataResult>("/onboarding/demo-data", {
      include_members: true,
      include_payments: true,
      include_equipment: true,
      member_count: options?.member_count ?? 15,
    }),

  previewImport: async (file: File): Promise<ImportPreview> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await api.post<ImportPreview>(
      "/onboarding/import/preview",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return response.data;
  },

  commitImport: async (
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
        },
      }
    );
    return response.data;
  },

  submitFeedback: (data: FeedbackPayload) =>
    request.post<{ id: string }>("/feedback", data),

  getMetrics: () =>
    request.get<PilotMetrics>("/admin/metrics"),

  getTourStatus: () =>
    request.get<{ tour_completed: boolean }>("/onboarding/tour-status"),

  markTourComplete: () =>
    request.post<{ tour_completed: boolean }>("/onboarding/tour-complete", {}),
};
