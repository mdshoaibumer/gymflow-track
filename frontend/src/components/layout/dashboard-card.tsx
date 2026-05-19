import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DashboardCardProps {
  title: string;
  value: string;
  description: string;
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
      <Card className={className}>
        <CardContent className="p-5">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-7 w-20 mb-2" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("group hover:shadow-soft-md hover:-translate-y-0.5 transition-all duration-200", className)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
          {Icon && (
            <div className="rounded-lg bg-primary/8 p-2 group-hover:bg-primary/12 transition-colors duration-200">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
        <div className="mt-1.5 flex items-center gap-2">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                trend.value >= 0
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
              )}
            >
              {trend.value >= 0 ? "+" : ""}
              {trend.value}%
            </span>
          )}
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
