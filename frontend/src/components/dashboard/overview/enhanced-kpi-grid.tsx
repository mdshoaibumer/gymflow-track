"use client";

import { useCallback } from "react";
import { motion } from "framer-motion";
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
import { AnimatedNumber } from "@/components/animated-number";
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
    <motion.div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.04 } },
      }}
    >
      {data.kpis.map((kpi) => (
        <EnhancedKPICard key={kpi.key} kpi={kpi} />
      ))}
    </motion.div>
  );
}

function EnhancedKPICard({ kpi }: { kpi: KPICard }) {
  const config = KPI_CONFIG[kpi.key] ?? {
    icon: TrendingUp,
    color: "text-primary",
    formatValue: (v: number | string) => String(v),
  };

  const Icon = config.icon;
  const numericValue = Number(kpi.value);
  const hasGrowth = kpi.growth_percent !== null && kpi.growth_percent !== undefined;
  const isPositive = hasGrowth && kpi.growth_percent! >= 0;
  const isNeutral = hasGrowth && kpi.growth_percent === 0;

  // Format function for AnimatedNumber
  const formatFn = useCallback(
    (n: number) => {
      if (kpi.unit === "paise") return formatPaise(Math.round(n));
      if (kpi.unit === "percent") return `${n.toFixed(1)}%`;
      return String(Math.round(n));
    },
    [kpi.unit]
  );

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 28 } } }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.1 }}
    >
    <Card className="group relative hover:shadow-soft-md transition-all duration-300 ease-spring dark:dark-depth-card will-animate gradient-border overflow-hidden">
      {/* Subtle ambient glow on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] via-transparent to-accent-warm/[0.01] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl" />
      <CardContent className="p-4 animate-content-show relative">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate pr-2">
            {kpi.label}
          </p>
          <div className={cn("rounded-xl bg-muted/50 p-2 flex-shrink-0 group-hover:bg-primary/8 group-hover:scale-110 group-hover:shadow-[0_0_12px_-3px_hsl(var(--primary)/0.2)] transition-all duration-300 ease-spring")}>
            <Icon className={cn("h-3.5 w-3.5", config.color)} />
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold tracking-tight truncate">
              <AnimatedNumber value={numericValue} formatFn={formatFn} duration={800} />
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              {hasGrowth && !isNeutral && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
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
                <span className="text-[11px] text-muted-foreground">
                  vs {formatPaise(Number(kpi.previous_value))}
                </span>
              )}
              {kpi.previous_value !== null && kpi.previous_value !== undefined && kpi.unit === "count" && (
                <span className="text-[11px] text-muted-foreground">
                  vs {kpi.previous_value} prev
                </span>
              )}
            </div>
          </div>
          {/* Mini sparkline visualization */}
          <MiniSparkline value={numericValue} growth={kpi.growth_percent} />
        </div>
      </CardContent>
    </Card>
    </motion.div>
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
        <div className="flex items-end justify-between">
          <div>
            <Skeleton className="h-7 w-20 mb-2" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-12 rounded-sm" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Generates a deterministic pseudo-sparkline based on value and growth */
function MiniSparkline({ value, growth }: { value: number; growth?: number | null }) {
  // Generate 7 bars representing a mini trend
  const trend = growth ?? 0;
  const bars: number[] = [];
  const seed = Math.abs(value % 100) + 1;
  for (let i = 0; i < 7; i++) {
    // Create a plausible upward/downward trend shape
    const base = 30 + (trend >= 0 ? (i / 6) * 50 : (1 - i / 6) * 50);
    const noise = ((seed * (i + 1) * 7) % 20) - 10;
    bars.push(Math.min(100, Math.max(15, base + noise)));
  }

  return (
    <div className="sparkline-container flex-shrink-0" aria-hidden="true">
      {bars.map((h, i) => (
        <div
          key={i}
          className="sparkline-bar"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}
