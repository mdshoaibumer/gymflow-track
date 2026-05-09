"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  useNotifications,
  useNotificationStats,
  useTriggerScan,
  useCancelNotification,
  useRetryFailed,
} from "@/hooks/use-notifications";
import type { NotificationStatus } from "@/services/notification.service";
import { DashboardCard } from "@/components/layout/dashboard-card";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_VARIANTS: Record<NotificationStatus, "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  sent: "success",
  failed: "destructive",
  cancelled: "secondary",
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
  const { isAdminOrAbove } = useAuth();
  const [filterStatus, setFilterStatus] = useState<NotificationStatus | "">("");

  const { data: listData, isLoading } = useNotifications({
    status: filterStatus || undefined,
    limit: 50,
  });
  const { data: stats } = useNotificationStats();

  const notifications = listData?.notifications ?? [];
  const total = listData?.total ?? 0;

  const scanMutation = useTriggerScan();
  const cancelMutation = useCancelNotification();
  const retryMutation = useRetryFailed();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp Reminders</h1>
          <p className="text-sm text-muted-foreground">
            Automated renewal reminders and notification history.
          </p>
        </div>
        <RoleGate allowed={["owner", "admin"]}>
          <div className="flex gap-2">
            <Button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${scanMutation.isPending ? "animate-spin" : ""}`} />
              Scan Now
            </Button>
            <Button
              variant="outline"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
            >
              Retry Failed
            </Button>
          </div>
        </RoleGate>
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
            icon={stats.failed_count > 0 ? AlertTriangle : undefined}
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
        <span className="text-sm font-medium">Filter:</span>
        <Select
          value={filterStatus || "all"}
          onValueChange={(v) => setFilterStatus(v === "all" ? "" : (v as NotificationStatus))}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {total} total notification{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Notification Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-0">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-8" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No notifications found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Click &quot;Scan Now&quot; to check for upcoming renewal reminders.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Scheduled</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sent At</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Retries</th>
                    {isAdminOrAbove && (
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {notifications.map((n) => (
                    <tr key={n.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium">
                          {TYPE_LABELS[n.notification_type] || n.notification_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANTS[n.status]} className="capitalize">
                          {n.status}
                        </Badge>
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
                            className="ml-1 cursor-help text-destructive"
                            title={n.failure_reason}
                          >
                            ⚠
                          </span>
                        )}
                      </td>
                      {isAdminOrAbove && (
                        <td className="px-4 py-3">
                          {n.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => cancelMutation.mutate(n.id)}
                              disabled={cancelMutation.isPending}
                            >
                              Cancel
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
