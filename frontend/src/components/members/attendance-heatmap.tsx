"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface AttendanceHeatmapProps {
  attendance: { check_in_at: string }[];
  weeks?: number;
}

/**
 * A GitHub-style contribution heatmap showing gym visit frequency.
 * Compact, visually engaging — a fitness-dashboard signature component.
 */
export function AttendanceHeatmap({ attendance, weeks = 8 }: AttendanceHeatmapProps) {
  const { grid, maxCount } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalDays = weeks * 7;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - totalDays + 1);

    // Count visits per day
    const counts: Record<string, number> = {};
    for (const a of attendance) {
      const d = new Date(a.check_in_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      counts[key] = (counts[key] || 0) + 1;
    }

    let max = 0;
    const cells: { date: Date; count: number; key: string }[] = [];

    for (let i = 0; i < totalDays; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const count = counts[key] || 0;
      if (count > max) max = count;
      cells.push({ date, count, key });
    }

    return { grid: cells, maxCount: max };
  }, [attendance, weeks]);

  if (attendance.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-3">
        No attendance data to display
      </div>
    );
  }

  const getIntensity = (count: number): string => {
    if (count === 0) return "bg-muted/50 dark:bg-muted/30";
    if (maxCount <= 1) return "bg-emerald-500/80";
    const ratio = count / maxCount;
    if (ratio <= 0.25) return "bg-emerald-200 dark:bg-emerald-900/60";
    if (ratio <= 0.5) return "bg-emerald-400 dark:bg-emerald-700/80";
    if (ratio <= 0.75) return "bg-emerald-500 dark:bg-emerald-500";
    return "bg-emerald-600 dark:bg-emerald-400";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Visit History ({weeks} weeks)
        </p>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
            <div
              key={i}
              className={cn(
                "h-2.5 w-2.5 rounded-sm",
                ratio === 0 ? "bg-muted/50 dark:bg-muted/30"
                  : ratio <= 0.25 ? "bg-emerald-200 dark:bg-emerald-900/60"
                  : ratio <= 0.5 ? "bg-emerald-400 dark:bg-emerald-700/80"
                  : ratio <= 0.75 ? "bg-emerald-500 dark:bg-emerald-500"
                  : "bg-emerald-600 dark:bg-emerald-400",
              )}
            />
          ))}
          <span>More</span>
        </div>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
        {grid.map((cell) => (
          <div
            key={cell.key}
            className={cn("h-3 w-3 rounded-[3px] heatmap-cell", getIntensity(cell.count))}
            title={`${cell.date.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })}: ${cell.count} visit${cell.count !== 1 ? "s" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
