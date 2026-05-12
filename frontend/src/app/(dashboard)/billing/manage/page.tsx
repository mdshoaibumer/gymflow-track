"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CreditCard,
  Loader2,
  CalendarCheck,
  BarChart3,
  FileDown,
  Building2,
  MessageSquare,
  Check,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatPaise } from "@/lib/utils";
import { useSubscription, useBillingHistory, useCancelSubscription } from "@/hooks/use-billing";
import { useUsageInfo } from "@/hooks/use-feature-access";
import { UsageProgressCard } from "@/components/subscription/usage-progress-card";
import { UpgradePrompt } from "@/components/subscription/upgrade-prompt";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function BillingManagePage() {
  const { isOwner, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { data: subscription, isLoading: subLoading } = useSubscription(isOwner);
  const { data: history } = useBillingHistory(isOwner);
  const cancelMutation = useCancelSubscription();
  const usage = useUsageInfo();

  useEffect(() => {
    if (!authLoading && !isOwner) {
      router.replace("/dashboard");
    }
  }, [isOwner, authLoading, router]);

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel? You'll retain access until the end of your billing period.")) return;
    cancelMutation.mutate(undefined);
  };

  if (authLoading || !isOwner || subLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-3xl space-y-6"
    >
      <h1 className="text-2xl font-bold tracking-tight">Billing & Subscription</h1>

      {/* Subscription Status Card */}
      {subscription ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{subscription.plan.name} Plan</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatPaise(subscription.plan.price_in_paise)}/month
                </p>
              </div>
              <SubscriptionStatusBadge status={subscription.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription.is_trial && subscription.days_remaining !== null && (
              <div
                className={`rounded-md px-4 py-3 text-sm ${
                  subscription.days_remaining <= 3
                    ? "bg-destructive/10 text-destructive"
                    : subscription.days_remaining <= 7
                      ? "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                      : "bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                }`}
              >
                {subscription.days_remaining === 0
                  ? "Your trial expires today! Subscribe to keep using GymFlow Track."
                  : `${subscription.days_remaining} days remaining in your free trial.`}
              </div>
            )}

            {subscription.cancel_at_period_end && (
              <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-400">
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
              {usage.daysRemaining !== null && (
                <div>
                  <span className="text-muted-foreground">Renews in: </span>
                  <span className="font-medium">{usage.daysRemaining} days</span>
                </div>
              )}
            </div>

            {isOwner && (
              <>
                <Separator />
                <div className="flex gap-3">
                  <Button asChild>
                    <a href="/billing">
                      {subscription.is_trial || subscription.status === "expired"
                        ? "Choose a Plan"
                        : "Upgrade Plan"}
                    </a>
                  </Button>
                  {subscription.status === "active" && !subscription.cancel_at_period_end && (
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={handleCancel}
                      disabled={cancelMutation.isPending}
                    >
                      {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {cancelMutation.isPending ? "Cancelling..." : "Cancel Subscription"}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <CreditCard className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No subscription found</h3>
            <Button className="mt-4" asChild>
              <a href="/billing">View Plans</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Usage Dashboard */}
      {!usage.isLoading && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Usage</h2>

          {/* Usage Progress Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <UsageProgressCard
              label="Active Members"
              current={usage.currentMembers}
              max={usage.maxMembers}
              isUnlimited={usage.isUnlimitedMembers}
              percent={usage.memberUsagePercent}
              variant="members"
            />
            <UsageProgressCard
              label="Staff Accounts"
              current={usage.currentStaff}
              max={usage.maxStaff}
              isUnlimited={usage.isUnlimitedStaff}
              percent={usage.staffUsagePercent}
              variant="staff"
            />
          </div>

          {/* Usage Warnings */}
          {usage.memberWarningLevel !== "none" && (
            <UpgradePrompt
              level={usage.memberWarningLevel}
              resource="members"
              current={usage.currentMembers}
              max={usage.maxMembers}
              isUnlimited={usage.isUnlimitedMembers}
            />
          )}
          {usage.staffWarningLevel !== "none" && (
            <UpgradePrompt
              level={usage.staffWarningLevel}
              resource="staff"
              current={usage.currentStaff}
              max={usage.maxStaff}
              isUnlimited={usage.isUnlimitedStaff}
            />
          )}
        </div>
      )}

      {/* Feature Access Summary */}
      {!usage.isLoading && usage.limits && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feature Access</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <FeatureAccessRow
                icon={<CalendarCheck className="h-4 w-4" />}
                label="QR Attendance"
                enabled={usage.limits.qr_attendance_enabled}
                requiredPlan="Pro"
              />
              <FeatureAccessRow
                icon={<BarChart3 className="h-4 w-4" />}
                label="Advanced Analytics"
                enabled={usage.limits.advanced_analytics_enabled}
                requiredPlan="Pro"
              />
              <FeatureAccessRow
                icon={<FileDown className="h-4 w-4" />}
                label="Export Reports"
                enabled={usage.limits.export_reports_enabled}
                requiredPlan="Pro"
              />
              <FeatureAccessRow
                icon={<Building2 className="h-4 w-4" />}
                label="Multi-Branch"
                enabled={usage.limits.multi_branch_enabled}
                requiredPlan="Elite"
              />
              <FeatureAccessRow
                icon={<MessageSquare className="h-4 w-4" />}
                label="Automated WhatsApp"
                enabled={usage.limits.automated_whatsapp_enabled}
                requiredPlan="Elite"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing History */}
      {history && history.invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billing History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Invoice</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Period</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-mono text-xs">{inv.invoice_number}</td>
                      <td className="px-4 py-2">
                        {new Date(inv.period_start).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                        {" — "}
                        {new Date(inv.period_end).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      </td>
                      <td className="px-4 py-2 font-medium">
                        {formatPaise(inv.amount_in_paise)}
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
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

function FeatureAccessRow({
  icon,
  label,
  enabled,
  requiredPlan,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  requiredPlan: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <div className="text-muted-foreground">{icon}</div>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {enabled ? (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">{requiredPlan}+</span>
      )}
    </div>
  );
}

function SubscriptionStatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "success" | "destructive" | "warning" | "secondary"> = {
    trial: "default",
    active: "success",
    past_due: "destructive",
    cancelled: "warning",
    expired: "secondary",
  };
  return (
    <Badge variant={variants[status] || "secondary"} className="uppercase">
      {status.replace("_", " ")}
    </Badge>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const variants: Record<string, "success" | "warning" | "destructive" | "default"> = {
    paid: "success",
    pending: "warning",
    failed: "destructive",
    refunded: "default",
  };
  return (
    <Badge variant={variants[status] || "secondary"} className="capitalize">
      {status}
    </Badge>
  );
}
