"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import {
  TrendingUp,
  AlertCircle,
  CalendarCheck,
  Dumbbell,
} from "lucide-react";
import { WhatsAppReminderButton } from "@/components/whatsapp/whatsapp-reminder-button";
import { DashboardCard } from "@/components/layout/dashboard-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import { formatPaise } from "@/lib/utils";
import {
  useDashboardMetrics,
  useExpiringMembers,
  useRecentPayments,
} from "@/hooks/use-payments";
import { useAttendanceStats, useAttendanceTrend } from "@/hooks/use-attendance";
import { useNotificationStats } from "@/hooks/use-notifications";
import {
  DashboardFilters,
  getFilterState,
  type DashboardFilterState,
} from "@/components/dashboard/filters/dashboard-filters";
import { EnhancedKPIGrid } from "@/components/dashboard/overview/enhanced-kpi-grid";

// Dynamic imports for heavy chart components — reduces initial JS bundle by ~120KB
const RevenueTrendChart = dynamic(
  () => import("@/components/dashboard/financials/revenue-trend-chart").then(m => ({ default: m.RevenueTrendChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const MembershipDistributionChart = dynamic(
  () => import("@/components/dashboard/growth/membership-distribution-chart").then(m => ({ default: m.MembershipDistributionChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const AttendanceTrendChart = dynamic(
  () => import("@/components/dashboard/attendance-trend-chart").then(m => ({ default: m.AttendanceTrendChart })),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> }
);

function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <Card>
      <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
      <CardContent><Skeleton className="w-full" style={{ height }} /></CardContent>
    </Card>
  );
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 28 } },
};

export default function DashboardPage() {
  const [filters, setFilters] = useState<DashboardFilterState>(() =>
    getFilterState("30d"),
  );
  const prefersReducedMotion = useReducedMotion();

  const handleFilterChange = useCallback((state: DashboardFilterState) => {
    setFilters(state);
  }, []);

  const { data: metrics } = useDashboardMetrics();
  const { data: expiring } = useExpiringMembers(7);
  const { data: recentPayments } = useRecentPayments(5);
  const { data: notifStats } = useNotificationStats();
  const { data: attendanceStats } = useAttendanceStats();
  const { data: trendData } = useAttendanceTrend(14);

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Header + Filters */}
      <motion.div variants={item} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-display text-gradient-subtle">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Welcome back! Here&apos;s your gym analytics overview.
          </p>
        </div>
        <DashboardFilters value={filters} onChange={handleFilterChange} />
      </motion.div>

      {/* Enhanced KPI Cards */}
      <motion.div variants={item}>
        <EnhancedKPIGrid periodDays={filters.periodDays} />
      </motion.div>

      {/* Analytics Charts Row */}
      <motion.div variants={item} className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <RevenueTrendChart dateFrom={filters.dateFrom} dateTo={filters.dateTo} />
        </div>
        <div className="lg:col-span-2">
          <MembershipDistributionChart />
        </div>
      </motion.div>

      {/* Attendance Quick Stats */}
      {attendanceStats && (
        <motion.div variants={item} className="grid gap-4 sm:grid-cols-3">
          <DashboardCard
            title="Checked In Today"
            value={String(attendanceStats.checked_in_today)}
            description="Total check-ins"
            icon={CalendarCheck}
          />
          <DashboardCard
            title="In Gym Now"
            value={String(attendanceStats.currently_in_gym)}
            description={<LiveIndicator label="Active right now" />}
            icon={Dumbbell}
          />
          <DashboardCard
            title="This Week"
            value={String(attendanceStats.total_this_week)}
            description="Total visits"
            icon={TrendingUp}
          />
        </motion.div>
      )}

      {/* Attendance Trend Chart — dynamically loaded */}
      <motion.div variants={item}>
        <AttendanceTrendChart trendData={trendData} prefersReducedMotion={!!prefersReducedMotion} />
      </motion.div>

      {/* Expiring + Recent Payments Lists */}
      <motion.div variants={item} className="grid gap-6 lg:grid-cols-2">
        {/* Expiring Memberships */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expiring Memberships</CardTitle>
          </CardHeader>
          <CardContent>
            {!expiring ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : expiring.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No memberships expiring in the next 7 days
              </p>
            ) : (
              <div className="divide-y">
                {expiring.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-3 gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.phone}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <Badge variant="outline" className="text-xs">
                          {m.membership_plan || "No plan"}
                        </Badge>
                        <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mt-1">
                          Expires{" "}
                          {m.membership_end
                            ? new Date(m.membership_end).toLocaleDateString("en-IN")
                            : "—"}
                        </p>
                      </div>
                      <WhatsAppReminderButton
                        compact
                        member={{
                          name: m.name,
                          phone: m.phone,
                          membership_end: m.membership_end,
                          membership_plan: m.membership_plan,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Payments List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {!recentPayments ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : recentPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No payments recorded yet
              </p>
            ) : (
              <div className="divide-y">
                {recentPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-3">
                    <div>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {p.payment_method.replace("_", " ")}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(p.payment_date).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">
                      {formatPaise(p.amount_in_paise)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Alert Cards */}
      <motion.div variants={item} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* WhatsApp Stats */}
        {notifStats &&
          (notifStats.sent_today > 0 || notifStats.failed_count > 0 || notifStats.pending_count > 0) && (
            <>
              {notifStats.sent_today > 0 && (
                <Card className="border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/20">
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold text-green-800 dark:text-green-400">
                      ✓ {notifStats.sent_today} Reminder{notifStats.sent_today !== 1 ? "s" : ""} Sent Today
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-500 mt-1">
                      WhatsApp messages delivered today.
                    </p>
                  </CardContent>
                </Card>
              )}
              {notifStats.failed_count > 0 && (
                <Card className="border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold text-red-800 dark:text-red-400">
                      <AlertCircle className="inline h-4 w-4 mr-1" />
                      {notifStats.failed_count} Failed
                    </p>
                    <p className="text-xs text-red-700 dark:text-red-500 mt-1">
                      Messages that failed — check Reminders page.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

        {/* Dues */}
        {metrics && metrics.pending_dues_count > 0 && (
          <Link href="/payments?status=pending">
            <Card className="border-yellow-200 dark:border-yellow-900/50 bg-yellow-50/50 dark:bg-yellow-950/20 cursor-pointer hover:shadow-soft-md hover:-translate-y-0.5 transition-all duration-200">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-400">
                  <AlertCircle className="inline h-4 w-4 mr-1" />
                  {metrics.pending_dues_count} Pending Due{metrics.pending_dues_count !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-500 mt-1">
                  Payments marked as pending — follow up for collection.
                </p>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Expired */}
        {metrics && metrics.expired_members > 0 && (
          <Link href="/members?status=expired">
            <Card className="border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 cursor-pointer hover:shadow-soft-md hover:-translate-y-0.5 transition-all duration-200">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-red-800 dark:text-red-400">
                  <AlertCircle className="inline h-4 w-4 mr-1" />
                  {metrics.expired_members} Expired Membership{metrics.expired_members !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-red-700 dark:text-red-500 mt-1">
                  Members with expired memberships — contact for renewal.
                </p>
              </CardContent>
            </Card>
          </Link>
        )}
      </motion.div>
    </motion.div>
  );
}
