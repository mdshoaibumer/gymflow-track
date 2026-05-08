"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  notificationService,
  type Notification,
  type NotificationStats,
  type NotificationStatus,
} from "@/services/notification.service";
import { DashboardCard } from "@/components/layout/dashboard-card";

const STATUS_LABELS: Record<NotificationStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<NotificationStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const TYPE_LABELS: Record<string, string> = {
  expiry_7_days: "7-Day Expiry",
  expiry_3_days: "3-Day Expiry",
  membership_expired: "Expired",
  payment_overdue: "Payment Due",
  welcome: "Welcome",
  renewal_confirmation: "Renewal",
};

export default function NotificationsPage() {
  const { token, user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<NotificationStatus | "">("");
  const [actionLoading, setActionLoading] = useState(false);

  const isAdminOrAbove = user?.role === "owner" || user?.role === "admin";

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        notificationService.list(token, {
          status: filterStatus || undefined,
          limit: 50,
        }),
        notificationService.stats(token),
      ]);
      setNotifications(listRes.notifications);
      setTotal(listRes.total);
      setStats(statsRes);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTriggerScan = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      const result = await notificationService.triggerScan(token);
      alert(`Scheduled ${result.reminders_scheduled} new reminder(s).`);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to trigger scan");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      const result = await notificationService.retryFailed(token);
      alert(`Reset ${result.reminders_scheduled} notification(s) for retry.`);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to retry");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!token) return;
    try {
      await notificationService.cancel(token, id);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Reminders</h1>
          <p className="text-sm text-muted-foreground">
            Automated renewal reminders and notification history.
          </p>
        </div>
        {isAdminOrAbove && (
          <div className="flex gap-2">
            <button
              onClick={handleTriggerScan}
              disabled={actionLoading}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Scan Now
            </button>
            <button
              onClick={handleRetryFailed}
              disabled={actionLoading}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              Retry Failed
            </button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardCard
            title="Pending"
            value={String(stats.pending_count)}
            description="Scheduled to send"
          />
          <DashboardCard
            title="Sent Today"
            value={String(stats.sent_today)}
            description="Delivered today"
          />
          <DashboardCard
            title="Failed"
            value={String(stats.failed_count)}
            description="Needs attention"
          />
          <DashboardCard
            title="Upcoming"
            value={String(stats.upcoming_count)}
            description="Queued reminders"
          />
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Filter by status:</label>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as NotificationStatus | "")}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span className="text-xs text-muted-foreground">
          {total} total notification{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Notification Table */}
      {loading ? (
        <div className="py-10 text-center text-muted-foreground">Loading...</div>
      ) : notifications.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          No notifications found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Scheduled</th>
                <th className="px-4 py-3 text-left font-medium">Sent At</th>
                <th className="px-4 py-3 text-left font-medium">Retries</th>
                {isAdminOrAbove && (
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {notifications.map((n) => (
                <tr key={n.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className="font-medium">
                      {TYPE_LABELS[n.notification_type] || n.notification_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[n.status]}`}
                    >
                      {STATUS_LABELS[n.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(n.scheduled_for).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {n.sent_at
                      ? new Date(n.sent_at).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {n.retry_count}
                    {n.failure_reason && (
                      <span
                        className="ml-1 cursor-help text-red-500"
                        title={n.failure_reason}
                      >
                        ⚠
                      </span>
                    )}
                  </td>
                  {isAdminOrAbove && (
                    <td className="px-4 py-3">
                      {n.status === "pending" && (
                        <button
                          onClick={() => handleCancel(n.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
