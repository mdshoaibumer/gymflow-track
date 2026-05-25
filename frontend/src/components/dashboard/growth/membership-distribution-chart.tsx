"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ChartCard } from "@/components/dashboard/charts/chart-card";
import { formatPaise } from "@/lib/utils";
import { useMembershipDistribution } from "@/hooks/use-analytics";
import { useReducedMotion } from "framer-motion";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(220, 70%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(340, 65%, 55%)",
];

export function MembershipDistributionChart() {
  const { data, isLoading } = useMembershipDistribution();
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [hiddenPlans, setHiddenPlans] = useState<Set<string>>(new Set());

  const chartData = useMemo(() => {
    if (!data?.distributions) return [];
    return data.distributions.map((d, i) => ({
      name: d.plan,
      value: d.member_count,
      percentage: d.percentage,
      revenue: d.revenue_contribution_paise,
      fill: COLORS[i % COLORS.length],
    }));
  }, [data]);

  const visibleChartData = useMemo(() => {
    return chartData.filter((d) => !hiddenPlans.has(d.name));
  }, [chartData, hiddenPlans]);

  const togglePlan = (planName: string) => {
    setHiddenPlans((prev) => {
      const next = new Set(prev);
      if (next.has(planName)) {
        next.delete(planName);
      } else {
        // Don't allow hiding all plans
        if (next.size < chartData.length - 1) {
          next.add(planName);
        }
      }
      return next;
    });
  };

  const hasData = chartData.length > 0 && chartData.some((d) => d.value > 0);

  return (
    <ChartCard
      title="Membership Distribution"
      description={
        data
          ? `${data.total_members} active members${data.most_popular_plan ? ` · Most popular: ${data.most_popular_plan}` : ""}`
          : undefined
      }
      loading={isLoading}
      empty={!hasData && !isLoading}
      emptyMessage="No active memberships yet"
    >
      {/* Screen-reader summary (UI/UX Pro Max: screen-reader-summary) */}
      {data && (
        <p className="sr-only" aria-live="polite">
          Membership distribution donut chart. {data.total_members} total active members
          across {chartData.length} plans.
          {data.most_popular_plan ? ` Most popular plan: ${data.most_popular_plan}.` : ""}
        </p>
      )}

      <div className="flex flex-col lg:flex-row items-center gap-4">
        {/* Pie chart */}
        <div className="w-full lg:w-1/2">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart role="img" aria-label="Membership distribution donut chart">
              <Pie
                data={visibleChartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                animationDuration={prefersReducedMotion ? 0 : 400}
                animationBegin={prefersReducedMotion ? 0 : 100}
                animationEasing="ease-out"
                onClick={(_, index) => {
                  const plan = visibleChartData[index]?.name;
                  if (plan) router.push(`/members?plan=${encodeURIComponent(plan)}`);
                }}
                style={{ cursor: "pointer" }}
              >
                {visibleChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg text-sm">
                      <p className="font-semibold">{d.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {d.value} member{d.value !== 1 ? "s" : ""} · {d.percentage}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Revenue: {formatPaise(d.revenue)}
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Interactive Legend table — click to toggle series visibility (UI/UX Pro Max: legend-interactive) */}
        <div className="w-full lg:w-1/2 space-y-2">
          {chartData.map((d) => (
            <div
              key={d.name}
              onClick={() => togglePlan(d.name)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-all duration-150 cursor-pointer select-none ${
                hiddenPlans.has(d.name) ? "opacity-40" : ""
              }`}
              title={hiddenPlans.has(d.name) ? "Click to show in chart" : "Click to hide from chart"}
            >
              <div
                className={`h-3 w-3 rounded-full flex-shrink-0 transition-transform duration-150 ${
                  hiddenPlans.has(d.name) ? "scale-75" : ""
                }`}
                style={{ backgroundColor: d.fill }}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${hiddenPlans.has(d.name) ? "line-through" : ""}`}>{d.name}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold">{d.value}</p>
                <p className="text-[11px] text-muted-foreground">{d.percentage}%</p>
              </div>
            </div>
          ))}
          {data && data.total_members > 0 && (
            <div className="border-t pt-2 mt-2 px-3">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Total active</span>
                <span className="font-semibold text-foreground">{data.total_members}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Accessible data table alternative (UI/UX Pro Max: data-table for screen readers) */}
      {chartData.length > 0 && (
        <table className="sr-only" role="table" aria-label="Membership distribution data">
          <caption>Members by plan</caption>
          <thead>
            <tr>
              <th scope="col">Plan</th>
              <th scope="col">Members</th>
              <th scope="col">Percentage</th>
              <th scope="col">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((d) => (
              <tr key={d.name}>
                <td>{d.name}</td>
                <td>{d.value}</td>
                <td>{d.percentage}%</td>
                <td>{formatPaise(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
