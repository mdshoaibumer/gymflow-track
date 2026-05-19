"use client";

import {
  IndianRupee,
  Users,
  CalendarCheck,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatPaise } from "@/lib/utils";
import { useDashboardKPIs } from "@/hooks/use-analytics";
import type { KPICard } from "@/services/analytics.service";

const KPI_CONFIG: Record<
  string,
  { icon: LucideIcon; color: string; formatValue: (v: number | string, unit: string) => string }
> = {
  total_revenue: {
    icon: IndianRupee,
    color: "text-emerald-600 dark:text-emerald-400",
    formatValue: (v) => formatPaise(Number(v)),
  },
  active_members: {
    icon: Users,
    color: "text-blue-600 dark:text-blue-400",
    formatValue: (v) => String(v),
  },
  attendance_today: {
    icon: CalendarCheck,
    color: "text-violet-600 dark:text-violet-400",
    formatValue: (v) => String(v),
  },
  pending_renewals: {
    icon: Clock,
    color: "text-orange-600 dark:text-orange-400",
    formatValue: (v) => String(v),
  },
  expiring_memberships: {
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    formatValue: (v) => String(v),
  },
  collection_rate: {
    icon: TrendingUp,
    color: "text-teal-600 dark:text-teal-400",
    formatValue: (v) => `${Number(v).toFixed(1)}%`,
  },
};

function formatKPIValue(kpi: KPICard): string {
  const config = KPI_CONFIG[kpi.key];
  if (config) return config.formatValue(kpi.value, kpi.unit);
  if (kpi.unit === "paise") return formatPaise(Number(kpi.value));
  if (kpi.unit === "percent") return `${Number(kpi.value).toFixed(1)}%`;
  return String(kpi.value);
}

interface EnhancedKPIGridProps {
  periodDays: number;
}

export function EnhancedKPIGrid({ periodDays }: EnhancedKPIGridProps) {
  const { data, isLoading, isError } = useDashboardKPIs({
    period_days: periodDays,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <KPICardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {data.kpis.map((kpi) => (
        <EnhancedKPICard key={kpi.key} kpi={kpi} />
      ))}
    </div>
  );
}

function EnhancedKPICard({ kpi }: { kpi: KPICard }) {
  const config = KPI_CONFIG[kpi.key] ?? {
    icon: TrendingUp,
    color: "text-primary",
    formatValue: (v: number | string) => String(v),
  };

  const Icon = config.icon;
  const displayValue = formatKPIValue(kpi);
  const hasGrowth = kpi.growth_percent !== null && kpi.growth_percent !== undefined;
  const isPositive = hasGrowth && kpi.growth_percent! >= 0;
  const isNeutral = hasGrowth && kpi.growth_percent === 0;

  return (
    <Card className="group hover:shadow-soft-md transition-all duration-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate pr-2">
            {kpi.label}
          </p>
          <div className={cn("rounded-lg bg-muted/60 p-1.5 flex-shrink-0 group-hover:bg-muted transition-colors duration-200")}>
            <Icon className={cn("h-3.5 w-3.5", config.color)} />
          </div>
        </div>
        <p className="text-2xl font-bold tracking-tight">{displayValue}</p>
        <div className="mt-2 flex items-center gap-1.5">
          {hasGrowth && !isNeutral && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                isPositive
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
              )}
            >
              {isPositive ? (
                <TrendingUp className="h-2.5 w-2.5" />
              ) : (
                <TrendingDown className="h-2.5 w-2.5" />
              )}
              {isPositive ? "+" : ""}
              {kpi.growth_percent!.toFixed(1)}%
            </span>
          )}
          {kpi.previous_value !== null && kpi.previous_value !== undefined && kpi.unit === "paise" && (
            <span className="text-[10px] text-muted-foreground">
              vs {formatPaise(Number(kpi.previous_value))}
            </span>
          )}
          {kpi.previous_value !== null && kpi.previous_value !== undefined && kpi.unit === "count" && (
            <span className="text-[10px] text-muted-foreground">
              vs {kpi.previous_value} prev
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function KPICardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
        <Skeleton className="h-7 w-16 mb-2" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  );
}
