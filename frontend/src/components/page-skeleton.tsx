import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

interface PageSkeletonProps {
  /** Number of stat cards at the top */
  cards?: number;
  /** Show a table skeleton */
  table?: boolean;
  /** Show a chart skeleton */
  chart?: boolean;
  /** Number of table rows */
  rows?: number;
}

export function PageSkeleton({
  cards = 0,
  table = false,
  chart = false,
  rows = 5,
}: PageSkeletonProps) {
  return (
    <div className="space-y-8 animate-fade-in" role="status" aria-label="Loading content">
      {/* Header skeleton */}
      <div className="space-y-2.5">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Stat cards */}
      {cards > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-3 w-20 mb-4" />
                <Skeleton className="h-7 w-16 mb-2" />
                <Skeleton className="h-3 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Chart skeleton */}
      {chart && (
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-4 w-28 mb-5" />
            <Skeleton className="h-[240px] w-full rounded-lg" />
          </CardContent>
        </Card>
      )}

      {/* Table skeleton */}
      {table && (
        <Card>
          <CardContent className="p-0">
            {/* Header */}
            <div className="flex items-center gap-4 p-4 border-b">
              <Skeleton className="h-8 w-60" />
              <Skeleton className="h-8 w-24 ml-auto" />
            </div>
            {/* Rows */}
            <div className="divide-y">
              {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-16 rounded-md" />
                  <Skeleton className="h-4 w-16 ml-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
