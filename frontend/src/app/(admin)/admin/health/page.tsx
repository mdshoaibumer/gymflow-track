"use client";

import {
  AlertTriangle,
  CheckCircle,
  CreditCard,
  Building2,
  Shield,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminHealth } from "@/hooks/use-admin";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export default function HealthPage() {
  const { data: health, isLoading, error, dataUpdatedAt } = useAdminHealth();
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "health"] });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Health</h1>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Health</h1>
        </div>
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <p>Failed to load health data.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Health Monitoring</h1>
          <p className="text-muted-foreground">
            Real-time operational health of the GymFlow Track platform.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Last updated: {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"}
          </span>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-2 h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall Status */}
      <Card
        className={cn(
          "border-2",
          health.status === "healthy" && "border-green-300 dark:border-green-800",
          health.status === "degraded" && "border-amber-300 dark:border-amber-800",
          health.status === "critical" && "border-red-300 dark:border-red-800"
        )}
      >
        <CardContent className="flex items-center gap-4 p-6">
          {health.status === "healthy" ? (
            <CheckCircle className="h-10 w-10 text-green-600" />
          ) : health.status === "degraded" ? (
            <AlertTriangle className="h-10 w-10 text-amber-600" />
          ) : (
            <AlertTriangle className="h-10 w-10 text-red-600 animate-pulse" />
          )}
          <div>
            <h2 className="text-xl font-bold capitalize">{health.status}</h2>
            <p className="text-sm text-muted-foreground">
              {health.status === "healthy"
                ? "All systems are operating normally."
                : health.status === "degraded"
                ? "Some issues require attention."
                : "Critical issues detected. Immediate action recommended."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className={cn(
              "rounded-lg p-3",
              health.failed_payments_24h > 0
                ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                : "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
            )}>
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Failed Payments (24h)</p>
              <p className="text-3xl font-bold">{health.failed_payments_24h}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className={cn(
              "rounded-lg p-3",
              health.failed_payments_7d > 5
                ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                : "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
            )}>
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Failed Payments (7d)</p>
              <p className="text-3xl font-bold">{health.failed_payments_7d}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className={cn(
              "rounded-lg p-3",
              health.inactive_gyms_30d > 5
                ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                : "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
            )}>
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Inactive Gyms (30d)</p>
              <p className="text-3xl font-bold">{health.inactive_gyms_30d}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Active Alerts
          </CardTitle>
          <CardDescription>Issues requiring attention</CardDescription>
        </CardHeader>
        <CardContent>
          {health.alerts.length > 0 ? (
            <div className="space-y-3">
              {health.alerts.map((alert, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-4",
                    alert.level === "critical" &&
                      "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
                    alert.level === "warning" &&
                      "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
                    alert.level === "info" &&
                      "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
                  )}
                >
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 h-5 w-5 shrink-0",
                      alert.level === "critical" && "text-red-600",
                      alert.level === "warning" && "text-amber-600",
                      alert.level === "info" && "text-blue-600"
                    )}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{alert.title}</p>
                      <Badge
                        variant={
                          alert.level === "critical"
                            ? "destructive"
                            : alert.level === "warning"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-xs capitalize"
                      >
                        {alert.level}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {alert.description}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 font-mono">
                    {alert.count}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <CheckCircle className="h-12 w-12 text-green-600" />
              <div className="text-center">
                <p className="font-medium">No Active Alerts</p>
                <p className="text-sm text-muted-foreground">
                  All platform systems are operating normally.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
