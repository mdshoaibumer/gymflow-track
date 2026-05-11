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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { MetricCard, MetricCardSkeleton } from "@/components/admin/metric-card";
import { useAdminMetrics } from "@/hooks/use-admin";
import { formatPaise } from "@/lib/utils";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function AdminDashboardPage() {
  const { data: metrics, isLoading, error } = useAdminMetrics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
        <p className="text-muted-foreground">
          Monitor all gyms, subscriptions, and revenue across the platform.
        </p>
      </div>

      {/* Metrics Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
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
              title="Suspended Gyms"
              value={metrics.suspended_gyms}
              subtitle="Manually suspended"
              icon={Ban}
              iconClassName="bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
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
              title="Monthly Revenue (MRR)"
              value={formatPaise(metrics.mrr_in_paise)}
              subtitle="Active subscriptions"
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
              iconClassName="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400"
            />
          </motion.div>
        </motion.div>
      ) : null}

      {/* Charts Placeholder */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Revenue Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
              Revenue chart — coming in Phase 2
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Gym Growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
              Gym signup chart — coming in Phase 2
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
