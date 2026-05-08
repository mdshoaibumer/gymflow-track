"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  billingService,
  type Subscription,
  type BillingHistory,
} from "@/services/billing.service";

export default function BillingManagePage() {
  const { token, isOwner } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [history, setHistory] = useState<BillingHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      billingService.getSubscription(token),
      billingService.getHistory(token),
    ])
      .then(([sub, hist]) => {
        setSubscription(sub);
        setHistory(hist);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const handleCancel = async () => {
    if (!token || !confirm("Are you sure you want to cancel? You'll retain access until the end of your billing period.")) return;
    setCancelling(true);
    setError(null);
    try {
      const result = await billingService.cancel(token);
      setSuccess(result.message);
      // Refresh subscription
      const sub = await billingService.getSubscription(token);
      setSubscription(sub);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Billing & Subscription</h1>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>
      )}

      {/* Subscription Status Card */}
      {subscription && (
        <div className="rounded-lg border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{subscription.plan.name} Plan</h2>
              <p className="text-sm text-muted-foreground">
                ₹{(subscription.plan.price_in_paise / 100).toLocaleString("en-IN")}/month
              </p>
            </div>
            <StatusBadge status={subscription.status} />
          </div>

          {subscription.is_trial && subscription.days_remaining !== null && (
            <div className={`rounded-md px-4 py-3 text-sm ${
              subscription.days_remaining <= 3
                ? "bg-red-50 text-red-800"
                : subscription.days_remaining <= 7
                ? "bg-amber-50 text-amber-800"
                : "bg-blue-50 text-blue-800"
            }`}>
              {subscription.days_remaining === 0
                ? "Your trial expires today! Subscribe to keep using GymFlow."
                : `${subscription.days_remaining} days remaining in your free trial.`}
            </div>
          )}

          {subscription.cancel_at_period_end && (
            <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Your subscription is cancelled and will expire on{" "}
              {subscription.current_period_end
                ? new Date(subscription.current_period_end).toLocaleDateString("en-IN")
                : "the end of your current period"}.
            </div>
          )}

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {subscription.trial_end && subscription.is_trial && (
              <div>
                <span className="text-muted-foreground">Trial ends: </span>
                <span>{new Date(subscription.trial_end).toLocaleDateString("en-IN")}</span>
              </div>
            )}
            {subscription.current_period_start && (
              <div>
                <span className="text-muted-foreground">Current period: </span>
                <span>
                  {new Date(subscription.current_period_start).toLocaleDateString("en-IN")} —{" "}
                  {subscription.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString("en-IN")
                    : "N/A"}
                </span>
              </div>
            )}
          </div>

          {isOwner && (
            <div className="flex gap-3 border-t pt-4">
              <a
                href="/billing"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {subscription.is_trial || subscription.status === "expired"
                  ? "Choose a Plan"
                  : "Upgrade Plan"}
              </a>
              {subscription.status === "active" && !subscription.cancel_at_period_end && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  {cancelling ? "Cancelling..." : "Cancel Subscription"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!subscription && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No subscription found.</p>
          <a
            href="/billing"
            className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            View Plans
          </a>
        </div>
      )}

      {/* Billing History */}
      {history && history.invoices.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Billing History</h2>
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Invoice</th>
                  <th className="px-4 py-2 text-left font-medium">Period</th>
                  <th className="px-4 py-2 text-left font-medium">Amount</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {history.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-2">
                      {new Date(inv.period_start).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      {" — "}
                      {new Date(inv.period_end).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-2">
                      ₹{(inv.amount_in_paise / 100).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(inv.created_at).toLocaleDateString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    trial: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    past_due: "bg-red-100 text-red-700",
    cancelled: "bg-amber-100 text-amber-700",
    expired: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || "bg-gray-100"}`}>
      {status.replace("_", " ").toUpperCase()}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "text-green-600",
    pending: "text-amber-600",
    failed: "text-red-600",
    refunded: "text-blue-600",
  };
  return <span className={`text-xs font-medium ${styles[status] || ""}`}>{status}</span>;
}
