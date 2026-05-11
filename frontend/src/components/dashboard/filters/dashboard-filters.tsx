"use client";

import { useCallback } from "react";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DatePreset = "today" | "7d" | "30d" | "12m" | "custom";

export interface DashboardFilterState {
  preset: DatePreset;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  periodDays: number;
}

const PRESETS: { key: DatePreset; label: string; days: number }[] = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "7 Days", days: 7 },
  { key: "30d", label: "30 Days", days: 30 },
  { key: "12m", label: "12 Months", days: 365 },
];

function computeDates(preset: DatePreset): { from: string; to: string; days: number } {
  const today = new Date();
  const to = today.toISOString().split("T")[0];
  const match = PRESETS.find((p) => p.key === preset);
  const days = match?.days ?? 30;
  const from = new Date(today.getTime() - days * 86400000).toISOString().split("T")[0];
  return { from, to, days };
}

export function getFilterState(preset: DatePreset): DashboardFilterState {
  const { from, to, days } = computeDates(preset);
  return { preset, dateFrom: from, dateTo: to, periodDays: days };
}

interface DashboardFiltersProps {
  value: DashboardFilterState;
  onChange: (state: DashboardFilterState) => void;
}

export function DashboardFilters({ value, onChange }: DashboardFiltersProps) {
  const handlePresetClick = useCallback(
    (preset: DatePreset) => {
      onChange(getFilterState(preset));
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            variant={value.preset === p.key ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-7 px-3 text-xs font-medium transition-all",
              value.preset === p.key
                ? "shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => handlePresetClick(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        <span>
          {value.dateFrom && value.dateTo
            ? `${formatDateShort(value.dateFrom)} — ${formatDateShort(value.dateTo)}`
            : "All time"}
        </span>
      </div>
    </div>
  );
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}
