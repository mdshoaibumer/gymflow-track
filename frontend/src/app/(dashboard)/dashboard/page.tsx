"use client";

import { useState, useEffect } from "react";
import { DashboardCard } from "@/components/layout/dashboard-card";
import { useAuth } from "@/hooks/use-auth";
import {
  dashboardService,
  type DashboardMetrics,
  type ExpiringMember,
  type RecentPayment,
} from "@/services/payment.service";
import {
  notificationService,
  type NotificationStats,
} from "@/services/notification.service";
import {
  attendanceService,
  type AttendanceStats,
} from "@/services/attendance.service";
import {
  assetService,
  type AssetDashboardStats,
} from "@/services/asset.service";

export default function DashboardPage() {
  const { token } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [expiring, setExpiring] = useState<ExpiringMember[]>([]);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [notifStats, setNotifStats] = useState<NotificationStats | null>(null);
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats | null>(null);
  const [equipStats, setEquipStats] = useState<AssetDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      dashboardService.getMetrics(token),
      dashboardService.getExpiring(token, 7),
      dashboardService.getRecentPayments(token, 5),
      notificationService.stats(token),
      attendanceService.getStats(token),
      assetService.stats(token),
    ])
      .then(([m, e, p, ns, as_, eq]) => {
        setMetrics(m);
        setExpiring(e);
        setRecentPayments(p);
        setNotifStats(ns);
        setAttendanceStats(as_);
        setEquipStats(eq);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Welcome back! Here&apos;s your gym overview.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Total Members"
          value={loading ? "..." : String(metrics?.total_members ?? 0)}
          description="Registered members"
        />
        <DashboardCard
          title="Active Members"
          value={loading ? "..." : String(metrics?.active_members ?? 0)}
          description="Currently active"
        />
        <DashboardCard
          title="Expiring Soon"
          value={loading ? "..." : String(metrics?.expiring_soon ?? 0)}
          description="Next 7 days"
        />
        <DashboardCard
          title="Revenue (Month)"
          value={
            loading
              ? "..."
              : `₹${((metrics?.monthly_revenue_paise ?? 0) / 100).toLocaleString("en-IN")}`
          }
          description="Current month"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Expiring Memberships */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-3 text-lg font-semibold">Expiring Memberships</h2>
          {expiring.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No memberships expiring in the next 7 days.
            </p>
          ) : (
            <div className="divide-y">
              {expiring.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {m.membership_plan || "No plan"}
                    </p>
                    <p className="text-xs font-medium text-orange-600">
                      Expires{" "}
                      {m.membership_end
                        ? new Date(m.membership_end).toLocaleDateString("en-IN")
                        : "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Payments */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-3 text-lg font-semibold">Recent Payments</h2>
          {recentPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments recorded yet.
            </p>
          ) : (
            <div className="divide-y">
              {recentPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <p className="text-xs text-muted-foreground capitalize">
                      {p.payment_method.replace("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.payment_date).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    ₹{(p.amount_in_paise / 100).toLocaleString("en-IN")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* WhatsApp Reminder Stats */}
      {notifStats && (notifStats.sent_today > 0 || notifStats.failed_count > 0 || notifStats.pending_count > 0) && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-semibold text-green-800">
              ✓ {notifStats.sent_today} Reminder{notifStats.sent_today !== 1 ? "s" : ""} Sent Today
            </p>
            <p className="text-xs text-green-700">
              WhatsApp messages delivered today.
            </p>
          </div>
          {notifStats.pending_count > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-800">
                ⏳ {notifStats.pending_count} Queued
              </p>
              <p className="text-xs text-blue-700">
                Reminders scheduled and waiting to send.
              </p>
            </div>
          )}
          {notifStats.failed_count > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">
                ⚠ {notifStats.failed_count} Failed
              </p>
              <p className="text-xs text-red-700">
                Messages that failed — check Reminders page.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Attendance Today */}
      {attendanceStats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">
              {attendanceStats.checked_in_today} Check-in{attendanceStats.checked_in_today !== 1 ? "s" : ""} Today
            </p>
            <p className="text-xs text-emerald-700">
              Total members who visited today.
            </p>
          </div>
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
            <p className="text-sm font-semibold text-purple-800">
              {attendanceStats.currently_in_gym} In Gym Now
            </p>
            <p className="text-xs text-purple-700">
              Members currently working out.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm font-semibold">
              {attendanceStats.total_this_week} This Week
            </p>
            <p className="text-xs text-muted-foreground">
              Total visits this week.
            </p>
          </div>
        </div>
      )}

      {/* Equipment Status */}
      {equipStats && (equipStats.under_maintenance_count > 0 || equipStats.overdue_maintenance > 0 || equipStats.out_of_service_count > 0) && (
        <div className="grid gap-4 sm:grid-cols-3">
          {equipStats.under_maintenance_count > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-sm font-semibold text-yellow-800">
                {equipStats.under_maintenance_count} Under Maintenance
              </p>
              <p className="text-xs text-yellow-700">
                Equipment currently being serviced.
              </p>
            </div>
          )}
          {equipStats.overdue_maintenance > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">
                {equipStats.overdue_maintenance} Overdue Service{equipStats.overdue_maintenance !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-red-700">
                Past scheduled service date — check Equipment page.
              </p>
            </div>
          )}
          {equipStats.out_of_service_count > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">
                {equipStats.out_of_service_count} Out of Service
              </p>
              <p className="text-xs text-red-700">
                Broken equipment needs attention.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Due Payments + Expired indicators */}
      {metrics && (metrics.pending_dues_count > 0 || metrics.expired_members > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {metrics.pending_dues_count > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-sm font-semibold text-yellow-800">
                ⚠ {metrics.pending_dues_count} Pending Due
                {metrics.pending_dues_count !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-yellow-700">
                Payments marked as pending — follow up for collection.
              </p>
            </div>
          )}
          {metrics.expired_members > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">
                ⚠ {metrics.expired_members} Expired Membership
                {metrics.expired_members !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-red-700">
                Members with expired memberships — contact for renewal.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
