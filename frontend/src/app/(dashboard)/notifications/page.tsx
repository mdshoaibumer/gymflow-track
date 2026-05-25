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
import { EmptyState } from "@/components/empty-state";
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
          <h1 className="text-2xl font-bold tracking-tight text-gradient-subtle">WhatsApp Reminders</h1>
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
        <EmptyState
          icon={Bell}
          title="No notifications found"
          description='Click "Scan Now" to check for upcoming renewal reminders and payment overdue alerts.'
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-sm" role="table">
                <caption className="sr-only">Notification queue</caption>
                <thead className="border-b bg-muted/30 dark:bg-muted/15">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Scheduled</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Sent At</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Retries</th>
                    {isAdminOrAbove && (
                      <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {notifications.map((n) => (
                    <tr key={n.id} className="hover:bg-primary/[0.02] dark:hover:bg-primary/[0.04] transition-colors duration-150">
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

            {/* Mobile cards */}
            <div className="space-y-3 p-4 md:hidden">
              {notifications.map((n) => (
                <div key={n.id} className="flex items-start justify-between rounded-lg border p-3 gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-sm">
                      {TYPE_LABELS[n.notification_type] || n.notification_type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Scheduled: {new Date(n.scheduled_for).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    {n.sent_at && (
                      <p className="text-xs text-muted-foreground">
                        Sent: {new Date(n.sent_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    )}
                    {n.retry_count > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Retries: {n.retry_count}
                        {n.failure_reason && (
                          <span className="ml-1 text-destructive" title={n.failure_reason}>⚠</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge variant={STATUS_VARIANTS[n.status]} className="capitalize text-xs">
                      {n.status}
                    </Badge>
                    {isAdminOrAbove && n.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => cancelMutation.mutate(n.id)}
                        disabled={cancelMutation.isPending}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
