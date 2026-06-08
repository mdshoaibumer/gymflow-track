"use client";

import { useDuesAgingReport } from "@/hooks/use-dues";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPaise, cn } from "@/lib/utils";

const BUCKET_COLORS = [
  "bg-emerald-500",
  "bg-amber-500",
  "bg-orange-500",
  "bg-red-500",
];

const BUCKET_BG_COLORS = [
  "bg-emerald-50 dark:bg-emerald-950/30",
  "bg-amber-50 dark:bg-amber-950/30",
  "bg-orange-50 dark:bg-orange-950/30",
  "bg-red-50 dark:bg-red-950/30",
];

export function AgingReport() {
  const { data, isLoading } = useDuesAgingReport();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Aging Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.buckets.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Aging Report</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No outstanding dues to report
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxPaise = Math.max(...data.buckets.map((b) => b.total_paise), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Aging Report</span>
          <span className="text-sm font-normal text-muted-foreground">
            Total: {formatPaise(data.total_outstanding_paise)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.buckets.map((bucket, i) => {
          const widthPct = Math.max((bucket.total_paise / maxPaise) * 100, 4);
          return (
            <div
              key={bucket.range}
              className={cn("rounded-lg p-3 transition-colors", BUCKET_BG_COLORS[i])}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {bucket.range} days
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {bucket.count} {bucket.count === 1 ? "due" : "dues"}
                  </span>
                  <span className="text-sm font-semibold">
                    {formatPaise(bucket.total_paise)}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", BUCKET_COLORS[i])}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
