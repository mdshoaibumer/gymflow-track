"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, AlertCircle, CheckCircle2, Clock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useNotificationStats, useNotifications } from "@/hooks/use-notifications";
import type { Notification, NotificationType } from "@/services/notification.service";

const TYPE_CONFIG: Record<NotificationType, { icon: typeof Bell; label: string }> = {
  expiry_7_days: { icon: Clock, label: "Expiring in 7 days" },
  expiry_3_days: { icon: AlertCircle, label: "Expiring in 3 days" },
  membership_expired: { icon: AlertCircle, label: "Membership expired" },
  payment_overdue: { icon: CreditCard, label: "Payment overdue" },
  welcome: { icon: CheckCircle2, label: "Welcome message" },
  renewal_confirmation: { icon: CheckCircle2, label: "Renewal confirmed" },
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const { data: stats } = useNotificationStats();
  const { data: recent } = useNotifications({ limit: 8 });

  const pendingCount = stats?.pending_count ?? 0;
  const failedCount = stats?.failed_count ?? 0;
  const totalUnread = pendingCount + failedCount;
  const notifications = recent?.notifications ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {totalUnread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground animate-fade-in">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0" forceMount>
        <div className="flex items-center justify-between px-4 py-3">
          <h4 className="text-sm font-semibold">Notifications</h4>
          {stats && (
            <div className="flex gap-2">
              {stats.sent_today > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {stats.sent_today} sent today
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="max-h-[320px] overflow-y-auto border-t">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="rounded-xl bg-muted/60 p-3 mb-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No recent notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notif) => (
                <NotificationItem key={notif.id} notification={notif} />
              ))}
            </div>
          )}
        </div>

        <Separator />
        <div className="p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            asChild
            onClick={() => setOpen(false)}
          >
            <Link href="/notifications">View all notifications</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationItem({ notification }: { notification: Notification }) {
  const config = TYPE_CONFIG[notification.notification_type] ?? {
    icon: Bell,
    label: notification.notification_type,
  };
  const Icon = config.icon;
  const memberName = notification.payload?.member_name ?? "Member";

  const statusColor =
    notification.status === "failed"
      ? "text-destructive"
      : notification.status === "sent"
        ? "text-green-600 dark:text-green-400"
        : "text-muted-foreground";

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors duration-150">
      <div className="mt-0.5 rounded-lg bg-muted/60 p-1.5 shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{memberName}</p>
        <p className="text-xs text-muted-foreground">{config.label}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className={`text-[10px] font-medium capitalize ${statusColor}`}>
            {notification.status}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatTimeAgo(notification.scheduled_for)}
          </span>
        </div>
      </div>
    </div>
  );
}
