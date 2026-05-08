"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { billingService, type BillingMetrics } from "@/services/billing.service";

export default function BillingMetricsPage() {
  const { token, isOwner } = useAuth();
  const [metrics, setMetrics] = useState<BillingMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !isOwner) return;
    billingService
      .getMetrics(token)
      .then(setMetrics)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, isOwner]);

  if (!isOwner) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Only the gym owner can view billing metrics.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!metrics) {
    return <p className="text-muted-foreground">Unable to load metrics.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Billing Metrics</h1>
      <p className="text-sm text-muted-foreground">
        Internal operational metrics. Updated in real-time.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Monthly Recurring Revenue"
          value={`₹${(metrics.mrr_in_paise / 100).toLocaleString("en-IN")}`}
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
    </div>
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
    <div className={`rounded-lg border p-4 ${alert ? "border-red-200 bg-red-50" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${alert ? "text-red-700" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{sublabel}</p>
    </div>
  );
}
