"use client";

import {
  BarChart3,
  TrendingUp,
  Building2,
  Users,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useAdminAnalytics } from "@/hooks/use-admin";
import { formatPaise, cn } from "@/lib/utils";
import Link from "next/link";

export default function AnalyticsPage() {
  const { data: analytics, isLoading, error } = useAdminAnalytics();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Analytics</h1>
          <p className="text-muted-foreground">Deep insights into platform performance.</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Analytics</h1>
        </div>
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <p>Failed to load analytics data.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Analytics</h1>
        <p className="text-muted-foreground">
          Deep insights into platform growth, revenue, and feature adoption.
        </p>
      </div>

      {/* Quick Stats */}
      {analytics.payment_success_rate !== null && (
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <CreditCard className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium">Payment Success Rate (30d)</p>
              <p className={cn(
                "text-2xl font-bold",
                analytics.payment_success_rate >= 95 ? "text-green-600" :
                analytics.payment_success_rate >= 80 ? "text-amber-600" : "text-red-600"
              )}>
                {analytics.payment_success_rate.toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Member Growth */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-purple-600" />
              Member Growth
            </CardTitle>
            <CardDescription>New member registrations per month</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.member_growth.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={analytics.member_growth}>
                  <defs>
                    <linearGradient id="memberGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="period" fontSize={12} tickLine={false} />
                  <YAxis fontSize={12} tickLine={false} />
                  <Tooltip
                    formatter={(value: number) => [value, "Members"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fill="url(#memberGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No member data yet" />
            )}
          </CardContent>
        </Card>

        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Revenue Trend
            </CardTitle>
            <CardDescription>Monthly revenue from all gyms</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.revenue_trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.revenue_trend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="period" fontSize={12} tickLine={false} />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(v) => `₹${(v / 100).toLocaleString()}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatPaise(value), "Revenue"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No revenue data yet" />
            )}
          </CardContent>
        </Card>

        {/* Top Gyms by Revenue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-blue-600" />
              Top Gyms by Revenue
            </CardTitle>
            <CardDescription>Highest revenue-generating gyms</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.top_gyms.length > 0 ? (
              <div className="space-y-3">
                {analytics.top_gyms.map((gym, i) => (
                  <div key={gym.id} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <Link
                        href={`/admin/gyms/${gym.id}`}
                        className="text-sm font-medium hover:text-primary hover:underline"
                      >
                        {gym.name}
                      </Link>
                    </div>
                    <span className="text-sm font-bold text-green-600">
                      {formatPaise(gym.revenue_in_paise)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No revenue data</p>
            )}
          </CardContent>
        </Card>

        {/* Feature Adoption */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-amber-600" />
              Feature Adoption
            </CardTitle>
            <CardDescription>Gyms using each premium feature</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(analytics.feature_adoption).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(analytics.feature_adoption).map(([feature, count]) => (
                  <div key={feature} className="flex items-center justify-between">
                    <span className="text-sm capitalize">
                      {feature.replace(/_/g, " ")}
                    </span>
                    <Badge variant="secondary" className="font-mono">
                      {count} gyms
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No feature data</p>
            )}
          </CardContent>
        </Card>

        {/* Inactive Gyms */}
        {analytics.inactive_gyms.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Inactive Gyms (30+ days)
              </CardTitle>
              <CardDescription>
                Gyms with no payment activity in the last 30 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {analytics.inactive_gyms.map((gym) => (
                  <Link
                    key={gym.id}
                    href={`/admin/gyms/${gym.id}`}
                    className="flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted"
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{gym.name}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center text-muted-foreground">
      {message}
    </div>
  );
}
