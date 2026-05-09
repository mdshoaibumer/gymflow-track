"use client";

import { motion } from "framer-motion";
import {
  Users,
  UserCheck,
  Clock,
  IndianRupee,
  TrendingUp,
  AlertCircle,
  CalendarCheck,
  Dumbbell,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DashboardCard } from "@/components/layout/dashboard-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDashboardMetrics,
  useExpiringMembers,
  useRecentPayments,
} from "@/hooks/use-payments";
import { useAttendanceStats, useAttendanceTrend } from "@/hooks/use-attendance";
import { useNotificationStats } from "@/hooks/use-notifications";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function DashboardPage() {
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { data: expiring } = useExpiringMembers(7);
  const { data: recentPayments } = useRecentPayments(5);
  const { data: notifStats } = useNotificationStats();
  const { data: attendanceStats } = useAttendanceStats();
  const { data: trendData } = useAttendanceTrend(14);

  const chartData = trendData?.trend.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    }),
    visits: d.count,
  })) ?? [];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Welcome back! Here&apos;s your gym overview.
        </p>
      </motion.div>

      {/* Metric Cards */}
      <motion.div variants={item} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Total Members"
          value={String(metrics?.total_members ?? 0)}
          description="Registered members"
          icon={Users}
          loading={metricsLoading}
        />
        <DashboardCard
          title="Active Members"
          value={String(metrics?.active_members ?? 0)}
          description="Currently active"
          icon={UserCheck}
          loading={metricsLoading}
        />
        <DashboardCard
          title="Expiring Soon"
          value={String(metrics?.expiring_soon ?? 0)}
          description="Next 7 days"
          icon={Clock}
          loading={metricsLoading}
        />
        <DashboardCard
          title="Revenue (Month)"
          value={`₹${((metrics?.monthly_revenue_paise ?? 0) / 100).toLocaleString("en-IN")}`}
          description="Current month"
          icon={IndianRupee}
          loading={metricsLoading}
        />
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
            description="Active right now"
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

      {/* Charts Row */}
      <motion.div variants={item} className="grid gap-6 lg:grid-cols-2">
        {/* Attendance Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="visits"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#colorVisits)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                No attendance data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue from recent payments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Payments</CardTitle>
          </CardHeader>
          <CardContent>
            {recentPayments && recentPayments.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={recentPayments.map((p) => ({
                    date: new Date(p.payment_date).toLocaleDateString("en-IN", {
                      month: "short",
                      day: "numeric",
                    }),
                    amount: p.amount_in_paise / 100,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Amount"]}
                  />
                  <Bar
                    dataKey="amount"
                    fill="hsl(var(--chart-2))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                No payment data yet
              </div>
            )}
          </CardContent>
        </Card>
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
                  <div key={m.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.phone}</p>
                    </div>
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
                      ₹{(p.amount_in_paise / 100).toLocaleString("en-IN")}
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
          <Card className="border-yellow-200 dark:border-yellow-900/50 bg-yellow-50/50 dark:bg-yellow-950/20">
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
        )}

        {/* Expired */}
        {metrics && metrics.expired_members > 0 && (
          <Card className="border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
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
        )}
      </motion.div>
    </motion.div>
  );
}
