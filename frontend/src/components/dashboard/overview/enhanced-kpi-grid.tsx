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

interface EnhancedKPIGridProps {
  periodDays: number;
  enabled?: boolean;
}

export function EnhancedKPIGrid({ periodDays, enabled = true }: EnhancedKPIGridProps) {
  const { data, isLoading, isError } = useDashboardKPIs(
    { period_days: periodDays },
    enabled,
  );

  if (!enabled) return null;

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
      className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
      whileHover={{ y: -2, transition: { type: "spring", stiffness: 400, damping: 25 } }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.1 }}
    >
    <Card className="group relative border hover:shadow-soft-md hover:border-primary/15 transition-all duration-300 overflow-hidden fitness-card fitness-card-violet">
      {/* Animated gradient border on hover */}
      <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-primary/[0.03] via-transparent to-accent-warm/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <CardContent className="p-4 relative">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate pr-2">
            {kpi.label}
          </p>
          <div className={cn("rounded-xl bg-muted/50 p-2 flex-shrink-0 group-hover:bg-primary/8 group-hover:scale-110 transition-all duration-300")}>
            <Icon className={cn("h-3.5 w-3.5", config.color)} />
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold tracking-tight truncate tabular-nums">
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

/** Generates a deterministic SVG sparkline with gradient fill — enhanced with glow */
function MiniSparkline({ value, growth }: { value: number; growth?: number | null }) {
  const trend = growth ?? 0;
  const points: number[] = [];
  const seed = Math.abs(value % 100) + 1;
  const count = 10;

  for (let i = 0; i < count; i++) {
    const base = 55 + (trend >= 0 ? (i / (count - 1)) * 35 : (1 - i / (count - 1)) * 35);
    const noise = ((seed * (i + 1) * 7) % 25) - 12;
    points.push(Math.min(95, Math.max(10, base + noise)));
  }

  const width = 72;
  const height = 32;
  const stepX = width / (count - 1);

  // Build SVG path
  const pathPoints = points.map((p, i) => {
    const x = i * stepX;
    const y = height - (p / 100) * height;
    return `${x},${y}`;
  });

  const linePath = `M${pathPoints.join(" L")}`;
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  const isPositive = trend >= 0;
  const gradientId = `spark-${seed}-${Math.abs(Math.round(trend))}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="sparkline-svg flex-shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={isPositive ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)"} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isPositive ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={areaPath}
        fill={`url(#${gradientId})`}
      />
      <path
        d={linePath}
        fill="none"
        stroke={isPositive ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={width}
        cy={height - (points[count - 1] / 100) * height}
        r="2"
        fill={isPositive ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)"}
        className="animate-pulse-soft"
      />
    </svg>
  );
}
