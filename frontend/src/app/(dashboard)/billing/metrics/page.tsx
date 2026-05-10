"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatPaise } from "@/lib/utils";
import { useBillingMetrics } from "@/hooks/use-billing";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function BillingMetricsPage() {
  const { isOwner, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { data: metrics, isLoading } = useBillingMetrics();

  useEffect(() => {
    if (!authLoading && !isOwner) {
      router.replace("/dashboard");
    }
  }, [isOwner, authLoading, router]);

  if (authLoading || !isOwner) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!metrics) {
    return <p className="text-muted-foreground">Unable to load metrics.</p>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing Metrics</h1>
        <p className="text-sm text-muted-foreground">
          Internal operational metrics. Updated in real-time.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Monthly Recurring Revenue"
          value={formatPaise(metrics.mrr_in_paise)}
          sublabel="MRR"
        />
        <MetricCard
          label="Active Subscriptions"
          value={metrics.active_subscriptions.toString()}
          sublabel="Paying gyms"
        />
        <MetricCard
          label="Trial Subscriptions"
          value={metrics.trial_subscriptions.toString()}
          sublabel="Free trial"
        />
        <MetricCard
          label="Past Due"
          value={metrics.past_due_subscriptions.toString()}
          sublabel="Payment retry"
          alert={metrics.past_due_subscriptions > 0}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Cancelled This Month"
          value={metrics.cancelled_this_month.toString()}
          sublabel="Churn indicator"
          alert={metrics.cancelled_this_month > 0}
        />
        <MetricCard
          label="Trial → Paid Conversion"
          value={
            metrics.trial_conversion_rate !== null
              ? `${metrics.trial_conversion_rate}%`
              : "N/A"
          }
          sublabel="Conversion rate"
        />
        <MetricCard
          label="Payment Failure Rate"
          value={
            metrics.payment_failure_rate !== null
              ? `${metrics.payment_failure_rate}%`
              : "N/A"
          }
          sublabel="This month"
          alert={(metrics.payment_failure_rate ?? 0) > 10}
        />
      </div>
    </motion.div>
  );
}

function MetricCard({
  label,
  value,
  sublabel,
  alert = false,
}: {
  label: string;
  value: string;
  sublabel: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? "border-destructive/50" : ""}>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <p className={`text-2xl font-bold ${alert ? "text-destructive" : ""}`}>{value}</p>
          {alert && <AlertTriangle className="h-4 w-4 text-destructive" />}
        </div>
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      </CardContent>
    </Card>
  );
}
