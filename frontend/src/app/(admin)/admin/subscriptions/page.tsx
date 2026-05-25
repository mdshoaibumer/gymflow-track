"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminGyms } from "@/hooks/use-admin";
import { formatPaise, cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  active: { label: "Active", icon: CheckCircle, className: "text-green-600 bg-green-50 dark:bg-green-950/30" },
  trial: { label: "Trial", icon: Clock, className: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
  past_due: { label: "Past Due", icon: AlertCircle, className: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
  expired: { label: "Expired", icon: XCircle, className: "text-red-600 bg-red-50 dark:bg-red-950/30" },
  cancelled: { label: "Cancelled", icon: XCircle, className: "text-gray-600 bg-gray-50 dark:bg-gray-950/30" },
};

export default function SubscriptionsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data, isLoading } = useAdminGyms({
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(0);
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscription Control Center</h1>
        <p className="text-muted-foreground">
          Manage all gym subscriptions, trials, and billing status.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by gym name..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Subscription status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="expired">Expired / Locked</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Subscription Cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : !data || data.gyms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <CreditCard className="mb-4 h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">No subscriptions found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.gyms.map((gym) => {
              const config = STATUS_CONFIG[gym.subscription_status || ""] || STATUS_CONFIG.expired;
              const StatusIcon = config.icon;

              return (
                <Card key={gym.id} className="overflow-hidden hover:shadow-soft-md hover:-translate-y-0.5 transition-all duration-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">
                          <Link
                            href={`/admin/gyms/${gym.id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {gym.name}
                          </Link>
                        </CardTitle>
                        <CardDescription>{gym.owner?.name || "No owner"}</CardDescription>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("gap-1 capitalize", config.className)}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plan</span>
                      <span className="font-medium capitalize">
                        {gym.plan_name || "—"}
                        {gym.plan_tier && (
                          <Badge variant="secondary" className="ml-1 text-[11px] capitalize">
                            {gym.plan_tier}
                          </Badge>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Members</span>
                      <span className="font-medium">{gym.member_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Revenue</span>
                      <span className="font-medium">{formatPaise(gym.revenue_in_paise)}</span>
                    </div>
                    {gym.subscription_status === "trial" && gym.trial_end && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Trial ends</span>
                        <span className="font-medium text-amber-600">{gym.trial_end}</span>
                      </div>
                    )}
                    {gym.current_period_end && gym.subscription_status !== "trial" && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Period ends</span>
                        <span className="font-medium">{gym.current_period_end}</span>
                      </div>
                    )}
                    <div className="pt-2">
                      <Button size="sm" variant="outline" className="w-full" asChild>
                        <Link href={`/admin/gyms/${gym.id}`}>
                          Manage Subscription
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} ({data.total} total)
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
