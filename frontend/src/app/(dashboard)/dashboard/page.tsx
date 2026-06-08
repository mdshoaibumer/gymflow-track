"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import {
  TrendingUp,
  AlertCircle,
  CalendarCheck,
  Dumbbell,
  HandCoins,
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
import { useDuesSummary } from "@/hooks/use-dues";
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
  const { isAdminOrAbove } = useAuth();
  const [filters, setFilters] = useState<DashboardFilterState>(() =>
    getFilterState("30d"),
  );
  const prefersReducedMotion = useReducedMotion();

  const handleFilterChange = useCallback((state: DashboardFilterState) => {
    setFilters(state);
  }, []);

  const { data: metrics } = useDashboardMetrics(isAdminOrAbove);
  const { data: expiring } = useExpiringMembers(7);
  const { data: recentPayments } = useRecentPayments(isAdminOrAbove ? 5 : 0);
  const { data: notifStats } = useNotificationStats();
  const { data: attendanceStats } = useAttendanceStats();
  const { data: trendData } = useAttendanceTrend(14);
  const { data: duesSummary } = useDuesSummary();

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
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2">
            {isAdminOrAbove
              ? "Welcome back! Here\u2019s your gym analytics overview."
              : "Welcome back! Here\u2019s your operational overview."}
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </p>
        </div>
        {isAdminOrAbove && <DashboardFilters value={filters} onChange={handleFilterChange} />}
      </motion.div>

      {/* Enhanced KPI Cards — admin/owner only */}
      {isAdminOrAbove && (
        <motion.div variants={item}>
          <EnhancedKPIGrid periodDays={filters.periodDays} enabled={isAdminOrAbove} />
        </motion.div>
      )}

      {/* Analytics Charts Row — admin/owner only */}
      {isAdminOrAbove && (
        <motion.div variants={item} className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <RevenueTrendChart dateFrom={filters.dateFrom} dateTo={filters.dateTo} />
          </div>
          <div className="lg:col-span-2">
            <MembershipDistributionChart />
          </div>
        </motion.div>
      )}

      {/* Attendance Quick Stats — Premium Fitness Bento */}
      {attendanceStats && (
        <motion.div variants={item} className="grid gap-4 sm:grid-cols-3">
          <DashboardCard
            title="Checked In Today"
            value={String(attendanceStats.checked_in_today)}
            description="Total check-ins"
            icon={CalendarCheck}
            className="fitness-card fitness-card-blue"
          />
          <DashboardCard
            title="In Gym Now"
            value={String(attendanceStats.currently_in_gym)}
            description={<LiveIndicator label="Active right now" />}
            icon={Dumbbell}
            className="fitness-card fitness-card-emerald"
          />
          <DashboardCard
            title="This Week"
            value={String(attendanceStats.total_this_week)}
            description="Total visits"
            icon={TrendingUp}
            className="fitness-card fitness-card-violet"
          />
        </motion.div>
      )}

      {/* Attendance Trend Chart — dynamically loaded */}
      <motion.div variants={item}>
        <AttendanceTrendChart trendData={trendData} prefersReducedMotion={!!prefersReducedMotion} />
      </motion.div>

      {/* Expiring + Recent Payments Lists */}
      <motion.div variants={item} className={`grid gap-6 ${isAdminOrAbove ? "lg:grid-cols-2" : ""}`}>
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

        {/* Recent Payments List — admin/owner only */}
        {isAdminOrAbove && (
        <Card className="fitness-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Payment Activity
              {recentPayments && recentPayments.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-medium">
                  {recentPayments.length} recent
                </span>
              )}
            </CardTitle>
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
        )}
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

        {/* Dues Summary — admin/owner only */}
        {isAdminOrAbove && duesSummary && duesSummary.total_members_with_dues > 0 && (
          <Link href="/collections">
            <Card className="border-amber-200 dark:border-amber-900/50 bg-gradient-to-br from-amber-50/80 to-orange-50/40 dark:from-amber-950/30 dark:to-orange-950/20 cursor-pointer hover:shadow-soft-md hover:-translate-y-0.5 transition-all duration-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                  <HandCoins className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-amber-900 dark:text-amber-300 tabular-nums">
                    {formatPaise(duesSummary.total_outstanding_paise)} Pending
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                    from {duesSummary.total_members_with_dues} member{duesSummary.total_members_with_dues !== 1 ? "s" : ""} — tap to collect
                  </p>
                </div>
                {duesSummary.collected_this_month_paise > 0 && (
                  <div className="hidden sm:block text-right shrink-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Collected</p>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatPaise(duesSummary.collected_this_month_paise)}
                    </p>
                  </div>
                )}
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
