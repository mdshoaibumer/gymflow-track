"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/dashboard/charts/chart-card";
import { formatPaise, cn } from "@/lib/utils";
import { useRevenueTrend } from "@/hooks/use-analytics";
import { useReducedMotion } from "framer-motion";

type Granularity = "daily" | "weekly" | "monthly";

const GRANULARITY_OPTIONS: { key: Granularity; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

interface RevenueTrendChartProps {
  dateFrom?: string;
  dateTo?: string;
}

export function RevenueTrendChart({ dateFrom, dateTo }: RevenueTrendChartProps) {
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const prefersReducedMotion = useReducedMotion();

  const { data, isLoading } = useRevenueTrend({
    granularity,
    date_from: dateFrom,
    date_to: dateTo,
  });

  const chartData = useMemo(() => {
    if (!data?.data) return [];
    return data.data.map((point) => ({
      period: formatPeriodLabel(point.period, granularity),
      revenue: point.revenue_paise / 100,
      payments: point.payment_count,
      rawPeriod: point.period,
    }));
  }, [data, granularity]);

  const summary = data?.summary;
  const hasData = chartData.length > 0 && chartData.some((d) => d.revenue > 0);

  const granularityToggle = (
    <div className="flex items-center gap-1 rounded-md border p-0.5">
      {GRANULARITY_OPTIONS.map((opt) => (
        <Button
          key={opt.key}
          variant={granularity === opt.key ? "default" : "ghost"}
          size="sm"
          className={cn(
            "h-6 px-2.5 text-xs font-medium",
            granularity !== opt.key && "text-muted-foreground",
          )}
          onClick={() => setGranularity(opt.key)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );

  return (
    <ChartCard
      title="Revenue Trend"
      description={
        summary
          ? `${formatPaise(summary.total_revenue_paise)} total · ${summary.growth_percent !== null ? `${summary.growth_percent >= 0 ? "+" : ""}${summary.growth_percent}%` : "—"} vs prev period`
          : undefined
      }
      action={granularityToggle}
      loading={isLoading}
      empty={!hasData && !isLoading}
      emptyMessage="No revenue data yet. Payments will appear here once recorded."
    >
      <div className="space-y-4">
        {/* Screen-reader summary for accessibility (UI/UX Pro Max: screen-reader-summary) */}
        {summary && (
          <p className="sr-only" aria-live="polite">
            Revenue trend chart showing {granularity} data.
            Total revenue: {formatPaise(summary.total_revenue_paise)}.
            Growth: {summary.growth_percent !== null ? `${summary.growth_percent}%` : "no data"}.
            Collection rate: {summary.collection_rate_percent.toFixed(1)}%.
          </p>
        )}

        {/* Summary stats row */}
        {summary && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryChip label="Avg/day" value={formatPaise(summary.average_revenue_paise)} />
            <SummaryChip label="Pending" value={formatPaise(summary.pending_dues_paise)} />
            <SummaryChip label="Best Day" value={summary.best_collection_day ?? "—"} />
            <SummaryChip
              label="Collection"
              value={`${summary.collection_rate_percent.toFixed(1)}%`}
            />
          </div>
        )}

        {/* Chart */}
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            role="img"
            aria-label={`Revenue trend ${granularity} chart with ${chartData.length} data points`}
          >            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                <stop offset="40%" stopColor="hsl(var(--chart-1))" stopOpacity={0.12} />
                <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => {
                if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
                if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
                return `₹${v}`;
              }}
              width={55}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg border bg-card px-3 py-2 shadow-lg text-sm">
                    <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
                    <p className="font-semibold">
                      ₹{Number(payload[0].value).toLocaleString("en-IN")}
                    </p>
                    {payload[0].payload?.payments > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {payload[0].payload.payments} payment
                        {payload[0].payload.payments !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              fill="url(#revenueGradient)"
              animationDuration={prefersReducedMotion ? 0 : 400}
              animationBegin={prefersReducedMotion ? 0 : 100}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Accessible data table alternative (UI/UX Pro Max: data-table for screen readers) */}
        {chartData.length > 0 && (
          <table className="sr-only" role="table" aria-label="Revenue data table">
            <caption>Revenue trend data ({granularity})</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Revenue (₹)</th>
                <th scope="col">Payments</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((d) => (
                <tr key={d.rawPeriod}>
                  <td>{d.period}</td>
                  <td>{d.revenue.toLocaleString("en-IN")}</td>
                  <td>{d.payments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ChartCard>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2 border border-border/50 hover:border-primary/15 hover:bg-muted/70 transition-all duration-200">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="text-sm font-semibold mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}

function formatPeriodLabel(period: string, granularity: Granularity): string {
  if (granularity === "daily") {
    const d = new Date(period + "T00:00:00");
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  }
  if (granularity === "weekly") {
    const d = new Date(period + "T00:00:00");
    return `W ${d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`;
  }
  // monthly: "2025-05" → "May 25"
  const [year, month] = period.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}
