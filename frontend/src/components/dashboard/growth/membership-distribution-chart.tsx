"use client";

import { useMemo } from "react";
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
      <div className="flex flex-col lg:flex-row items-center gap-4">
        {/* Pie chart */}
        <div className="w-full lg:w-1/2">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                animationDuration={800}
                animationEasing="ease-out"
                onClick={(_, index) => {
                  const plan = chartData[index]?.name;
                  if (plan) router.push(`/members?plan=${encodeURIComponent(plan)}`);
                }}
                style={{ cursor: "pointer" }}
              >
                {chartData.map((entry, index) => (
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

        {/* Legend table */}
        <div className="w-full lg:w-1/2 space-y-2">
          {chartData.map((d) => (
            <div
              key={d.name}
              onClick={() => router.push(`/members?plan=${encodeURIComponent(d.name)}`)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <div
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: d.fill }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{d.name}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold">{d.value}</p>
                <p className="text-[10px] text-muted-foreground">{d.percentage}%</p>
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
    </ChartCard>
  );
}
