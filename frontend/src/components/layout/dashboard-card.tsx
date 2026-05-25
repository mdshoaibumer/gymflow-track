import { type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DashboardCardProps {
  title: string;
  value: string;
  description: React.ReactNode;
  icon?: LucideIcon;
  trend?: { value: number; label: string };
  loading?: boolean;
  className?: string;
}

export function DashboardCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  loading,
  className,
}: DashboardCardProps) {
  if (loading) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-5">
          <div className="space-y-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -3, transition: { type: "spring", stiffness: 400, damping: 25 } }}
      whileTap={{ scale: 0.98, transition: { duration: 0.1 } }}
    >
    <Card className={cn(
      "group relative overflow-hidden gradient-border",
      "hover:shadow-soft-lg hover:border-primary/15",
      "dark:hover:shadow-dark-soft-md dark:hover:border-primary/20 dark:dark-depth-card",
      "transition-[box-shadow,border-color] duration-300 ease-spring",
      className
    )}>
      {/* Subtle gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-accent-warm/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      {/* Top accent line — gradient shimmer */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
      <CardContent className="p-5 animate-content-show relative">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          {Icon && (
            <div className="rounded-xl bg-primary/8 p-2.5 group-hover:bg-primary/12 group-hover:scale-110 group-hover:shadow-glow/30 transition-all duration-300 ease-spring">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight font-display">{value}</p>
        <div className="mt-2 flex items-center gap-2">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold",
                trend.value >= 0
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-500/20"
                  : "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-500/20"
              )}
            >
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}%
            </span>
          )}
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
    </motion.div>
  );
}
