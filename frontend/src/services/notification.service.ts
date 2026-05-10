import { apiClient } from "@/lib/api";

export type NotificationType =
  | "expiry_7_days"
  | "expiry_3_days"
  | "membership_expired"
  | "payment_overdue"
  | "welcome"
  | "renewal_confirmation";

export type NotificationStatus = "pending" | "sent" | "failed" | "cancelled";

export interface Notification {
  id: string;
  gym_id: string;
  member_id: string;
  notification_type: NotificationType;
  channel: "whatsapp" | "sms";
  status: NotificationStatus;
  scheduled_for: string;
  sent_at: string | null;
  failure_reason: string | null;
  retry_count: number;
  payload: Record<string, string> | null;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
}

export interface NotificationStats {
  pending_count: number;
  sent_today: number;
  failed_count: number;
  upcoming_count: number;
}

export interface TriggerScanResponse {
  reminders_scheduled: number;
}

export interface ListNotificationsParams {
  skip?: number;
  limit?: number;
  status?: NotificationStatus;
  notification_type?: NotificationType;
}

export const notificationService = {
  list: (params: ListNotificationsParams = {}) => {
    const { skip = 0, limit = 50, status, notification_type } = params;
    const query = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    if (status) query.set("status", status);
    if (notification_type) query.set("notification_type", notification_type);
    return apiClient<NotificationListResponse>(`/notifications?${query}`);
  },

  stats: () =>
    apiClient<NotificationStats>("/notifications/stats"),

  upcoming: (limit = 20) =>
    apiClient<Notification[]>(`/notifications/upcoming?limit=${limit}`),

  triggerScan: () =>
    apiClient<TriggerScanResponse>("/notifications/scan", {
      method: "POST",
    }),

  cancel: (id: string) =>
    apiClient<Notification>(`/notifications/${id}/cancel`, {
      method: "POST",
    }),

  retryFailed: () =>
    apiClient<TriggerScanResponse>("/notifications/retry-failed", {
      method: "POST",
    }),
};
