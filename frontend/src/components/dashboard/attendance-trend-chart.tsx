"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltipContent } from "@/components/dashboard/charts/chart-tooltip";
import type { AttendanceTrendResponse } from "@/services/attendance.service";

interface AttendanceTrendChartProps {
  trendData: AttendanceTrendResponse | undefined;
  prefersReducedMotion: boolean;
}

export function AttendanceTrendChart({ trendData, prefersReducedMotion }: AttendanceTrendChartProps) {
  const chartData = useMemo(
    () =>
      trendData?.trend.map((d) => ({
        date: new Date(d.date).toLocaleDateString("en-IN", {
          month: "short",
          day: "numeric",
        }),
        visits: d.count,
      })) ?? [],
    [trendData]
  );

  return (
    <Card className="chart-container-premium fitness-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Attendance Trend
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            14 days
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <>
            <p className="sr-only" aria-live="polite">
              Attendance trend chart for the last 14 days showing {chartData.length} data points.
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart
                data={chartData}
                role="img"
                aria-label={`Attendance trend chart with ${chartData.length} data points`}
              >
                <defs>
                  <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={<ChartTooltipContent />}
                  cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <Area
                  type="monotone"
                  dataKey="visits"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  fill="url(#colorVisits)"
                  animationBegin={prefersReducedMotion ? 0 : 100}
                  animationDuration={prefersReducedMotion ? 0 : 400}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
            <table className="sr-only" role="table" aria-label="Attendance trend data">
              <caption>Daily attendance for the last 14 days</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Visits</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
            No attendance data yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
