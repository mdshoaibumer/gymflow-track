"use client";

import { motion } from "framer-motion";
import {
  Building2,
  CreditCard,
  Clock,
  Ban,
  Users,
  IndianRupee,
  AlertTriangle,
  TrendingUp,
  Lock,
  Activity,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

import { MetricCard, MetricCardSkeleton } from "@/components/admin/metric-card";
import { useAdminMetrics, useAdminHealth } from "@/hooks/use-admin";
import { formatPaise, cn } from "@/lib/utils";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const PLAN_COLORS: Record<string, string> = {
  starter: "#3b82f6",
  pro: "#8b5cf6",
  elite: "#f59e0b",
};

export default function AdminDashboardPage() {
  const { data: metrics, isLoading, error } = useAdminMetrics();
  const { data: health } = useAdminHealth();

  return (
    <div className="space-y-6">
      {/* Header with health status */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Platform Command Center
          </h1>
          <p className="text-muted-foreground">
            Real-time overview of all gyms, subscriptions, and revenue.
          </p>
        </div>
        {health && (
          <Badge
            variant={
              health.status === "healthy"
                ? "default"
                : health.status === "degraded"
                ? "secondary"
                : "destructive"
            }
            className={cn(
              "gap-1.5 px-3 py-1",
              health.status === "healthy" &&
                "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
            )}
          >
            <Activity className="h-3 w-3" />
            {health.status === "healthy"
              ? "All Systems Healthy"
              : health.status === "degraded"
              ? "Attention Needed"
              : "Critical Issues"}
          </Badge>
        )}
      </div>

      {/* Metrics Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <p>Failed to load metrics. Please try again.</p>
          </CardContent>
        </Card>
      ) : metrics ? (
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          variants={container}
          initial="hidden"
          animate="show"
        >
          <motion.div variants={item}>
            <MetricCard
              title="Total Gyms"
              value={metrics.total_gyms}
              subtitle="Registered on platform"
              icon={Building2}
              iconClassName="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
            />
          </motion.div>
          <motion.div variants={item}>
            <MetricCard
              title="Active Subscriptions"
              value={metrics.active_subscriptions}
              subtitle="Paid & past due"
              icon={CreditCard}
              iconClassName="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
            />
          </motion.div>
          <motion.div variants={item}>
            <MetricCard
              title="Trial Gyms"
              value={metrics.trial_gyms}
              subtitle="Free trial period"
              icon={Clock}
              iconClassName="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
            />
          </motion.div>
          <motion.div variants={item}>
            <MetricCard
              title="Suspended"
              value={metrics.suspended_gyms}
              subtitle="Manually suspended"
              icon={Ban}
              iconClassName="bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
            />
          </motion.div>
          <motion.div variants={item}>
            <MetricCard
              title="Locked"
              value={metrics.locked_gyms}
              subtitle="Expired subscriptions"
              icon={Lock}
              iconClassName="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400"
            />
          </motion.div>
          <motion.div variants={item}>
            <MetricCard
              title="Total Members"
              value={metrics.total_members.toLocaleString()}
              subtitle="Across all gyms"
              icon={Users}
              iconClassName="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
            />
          </motion.div>
          <motion.div variants={item}>
            <MetricCard
              title="MRR"
              value={formatPaise(metrics.mrr_in_paise)}
              subtitle={`ARR: ${formatPaise(metrics.arr_in_paise)}`}
              icon={IndianRupee}
              iconClassName="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            />
          </motion.div>
          <motion.div variants={item}>
            <MetricCard
              title="Failed Payments"
              value={metrics.failed_payments}
              subtitle="Last 30 days"
              icon={AlertTriangle}
              iconClassName={cn(
                "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
                metrics.failed_payments > 0 && "animate-pulse"
              )}
            />
          </motion.div>
        </motion.div>
      ) : null}

      {/* Charts */}
      {metrics && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenue Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                Revenue Trend
              </CardTitle>
              <CardDescription>Monthly payment volume (last 12 months)</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.revenue_trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={metrics.revenue_trend}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="period"
                      fontSize={12}
                      tickLine={false}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      fontSize={12}
                      tickLine={false}
                      tickFormatter={(v) => `₹${(v / 100).toLocaleString()}`}
                      className="fill-muted-foreground"
                    />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any) => [formatPaise(value), "Revenue"]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#revenueGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                  No revenue data yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Gym Growth */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-blue-600" />
                Gym Growth
              </CardTitle>
              <CardDescription>New gym registrations per month</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.gym_growth_trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={metrics.gym_growth_trend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="period"
                      fontSize={12}
                      tickLine={false}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      fontSize={12}
                      tickLine={false}
                      className="fill-muted-foreground"
                    />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any) => [value, "Gyms"]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                  No growth data yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Plan Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4 text-purple-600" />
                Plan Distribution
              </CardTitle>
              <CardDescription>Active subscriptions by plan tier</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.plan_distribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={metrics.plan_distribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="count"
                      nameKey="name"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={({ name, value }: any) => `${name}: ${value}`}
                    >
                      {metrics.plan_distribution.map((entry) => (
                        <Cell
                          key={entry.tier}
                          fill={PLAN_COLORS[entry.tier] || "#94a3b8"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                  No subscription data yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Health Alerts */}
          {health && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-rose-600" />
                  Health Alerts
                </CardTitle>
                <CardDescription>Issues requiring attention</CardDescription>
              </CardHeader>
              <CardContent>
                {health.alerts.length > 0 ? (
                  <div className="space-y-3">
                    {health.alerts.map((alert, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3",
                          alert.level === "critical" &&
                            "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
                          alert.level === "warning" &&
                            "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
                          alert.level === "info" &&
                            "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
                        )}
                      >
                        <AlertTriangle
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0",
                            alert.level === "critical" && "text-red-600",
                            alert.level === "warning" && "text-amber-600",
                            alert.level === "info" && "text-blue-600"
                          )}
                        />
                        <div>
                          <p className="text-sm font-medium">{alert.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {alert.description}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="ml-auto shrink-0"
                        >
                          {alert.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Activity className="h-8 w-8 text-green-600" />
                    <p className="text-sm">All systems healthy</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
