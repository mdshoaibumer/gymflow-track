"use client";

import { useState } from "react";
import {
  ScrollText,
  ChevronLeft,
  ChevronRight,
  Shield,
  Building2,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuditLogs } from "@/hooks/use-admin";

const PAGE_SIZE = 30;

const actionLabels: Record<string, { label: string; color: string }> = {
  trial_extended: { label: "Trial Extended", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  gym_suspended: { label: "Gym Suspended", color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  gym_unsuspended: { label: "Gym Unsuspended", color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  gym_locked: { label: "Gym Locked", color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400" },
  gym_unlocked: { label: "Gym Unlocked", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  plan_changed: { label: "Plan Changed", color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" },
  subscription_activated: { label: "Subscription Activated", color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  impersonation_start: { label: "Impersonation Start", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400" },
  impersonation_end: { label: "Impersonation End", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400" },
  billing_override: { label: "Billing Override", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400" },
  super_admin_created: { label: "Admin Created", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

export default function AuditLogsPage() {
  const [page, setPage] = useState(0);

  const { data, isLoading } = useAuditLogs({
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground">
          Track all administrative actions performed on the platform.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-4 p-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          ) : !data || data.entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ScrollText className="mb-4 h-12 w-12 opacity-30" />
              <p className="text-lg font-medium">No audit logs yet</p>
              <p className="text-sm">Administrative actions will appear here.</p>
            </div>
          ) : (
            <>
              <div className="divide-y">
                {data.entries.map((entry) => {
                  const actionConfig = actionLabels[entry.action] || {
                    label: entry.action,
                    color: "bg-gray-100 text-gray-700",
                  };

                  return (
                    <div key={entry.id} className="flex items-start gap-4 p-4">
                      <div className="mt-0.5 rounded-full bg-muted p-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${actionConfig.color}`}>
                            {actionConfig.label}
                          </span>
                          {entry.target_gym_name && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3" />
                              {entry.target_gym_name}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm">{entry.description}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {entry.actor_name && (
                            <span>by {entry.actor_name}</span>
                          )}
                          {entry.ip_address && (
                            <span>IP: {entry.ip_address}</span>
                          )}
                          {entry.created_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total}
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
        </CardContent>
      </Card>
    </div>
  );
}
