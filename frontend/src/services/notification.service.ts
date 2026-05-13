import { request } from "@/lib/api";

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
    return request.get<NotificationListResponse>(`/notifications?${query}`);
  },

  stats: () =>
    request.get<NotificationStats>("/notifications/stats"),

  upcoming: (limit = 20) =>
    request.get<Notification[]>(`/notifications/upcoming?limit=${limit}`),

  triggerScan: () =>
    request.post<TriggerScanResponse>("/notifications/scan"),

  cancel: (id: string) =>
    request.post<Notification>(`/notifications/${id}/cancel`),

  retryFailed: () =>
    request.post<TriggerScanResponse>("/notifications/retry-failed"),
};
