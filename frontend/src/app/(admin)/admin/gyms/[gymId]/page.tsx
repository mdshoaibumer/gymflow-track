"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  User,
  Calendar,
  Users,
  CreditCard,
  Shield,
  Clock,
  AlertTriangle,
  Ban,
  Lock,
  Unlock,
  RefreshCw,
  Play,
  Pause,
  UserCheck,
  History,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubscriptionBadge, PlanBadge, ActiveStatusBadge } from "@/components/admin/status-badges";
import { MetricCard } from "@/components/admin/metric-card";
import {
  useAdminGymDetail,
  useExtendTrial,
  useSuspendGym,
  useUnsuspendGym,
  useLockGym,
  useUnlockGym,
  useChangePlan,
  useActivateSubscription,
  useImpersonateGymOwner,
} from "@/hooks/use-admin";
import { formatPaise } from "@/lib/utils";

type ActionType = "suspend" | "unsuspend" | "extend_trial" | "lock" | "unlock" | "change_plan" | "activate" | null;

export default function GymDetailPage() {
  const params = useParams();
  const router = useRouter();
  const gymId = params.gymId as string;

  const { data: gym, isLoading, error } = useAdminGymDetail(gymId);

  // Action state
  const [actionType, setActionType] = useState<ActionType>(null);
  const [reason, setReason] = useState("");
  const [trialDays, setTrialDays] = useState(7);
  const [newPlan, setNewPlan] = useState("pro");

  const extendTrialMutation = useExtendTrial();
  const suspendMutation = useSuspendGym();
  const unsuspendMutation = useUnsuspendGym();
  const lockMutation = useLockGym();
  const unlockMutation = useUnlockGym();
  const changePlanMutation = useChangePlan();
  const activateMutation = useActivateSubscription();
  const impersonateMutation = useImpersonateGymOwner();

  const closeAction = () => {
    setActionType(null);
    setReason("");
  };

  const executeAction = async () => {
    if (!gym) return;
    if (actionType !== "activate" && !reason.trim()) return;

    switch (actionType) {
      case "suspend":
        await suspendMutation.mutateAsync({ gymId: gym.id, reason });
        break;
      case "unsuspend":
        await unsuspendMutation.mutateAsync({ gymId: gym.id, reason });
        break;
      case "extend_trial":
        await extendTrialMutation.mutateAsync({ gymId: gym.id, days: trialDays, reason });
        break;
      case "lock":
        await lockMutation.mutateAsync({ gymId: gym.id, reason });
        break;
      case "unlock":
        await unlockMutation.mutateAsync({ gymId: gym.id, newStatus: "active", reason });
        break;
      case "change_plan":
        await changePlanMutation.mutateAsync({ gymId: gym.id, planTier: newPlan, reason });
        break;
      case "activate":
        await activateMutation.mutateAsync({ gymId: gym.id });
        break;
    }
    closeAction();
  };

  const isActionPending =
    extendTrialMutation.isPending ||
    suspendMutation.isPending ||
    unsuspendMutation.isPending ||
    lockMutation.isPending ||
    unlockMutation.isPending ||
    changePlanMutation.isPending ||
    activateMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !gym) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
        <p className="text-lg font-medium">Gym not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/gyms">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{gym.name}</h1>
              <ActiveStatusBadge isActive={gym.is_active} />
            </div>
            <p className="text-sm text-muted-foreground">{gym.slug} · {gym.city || "No city"}</p>
          </div>
        </div>
        {gym.owner && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => impersonateMutation.mutate(
              { gymId: gym.id },
              {
                onSuccess: (data) => {
                  window.open(
                    `/dashboard?impersonation_token=${data.access_token}`,
                    "_blank"
                  );
                },
              }
            )}
            disabled={impersonateMutation.isPending}
          >
            <UserCheck className="mr-2 h-4 w-4" />
            {impersonateMutation.isPending ? "Starting..." : "Impersonate Owner"}
          </Button>
        )}
      </div>

      {/* Status Banners */}
      {!gym.is_active && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <Ban className="h-5 w-5 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-medium text-red-800 dark:text-red-300">Gym Suspended</p>
            <p className="text-sm text-red-600 dark:text-red-400">This gym has been suspended and cannot operate.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setActionType("unsuspend")}
          >
            <Play className="mr-1 h-3 w-3" /> Unsuspend
          </Button>
        </div>
      )}

      {gym.subscription_status === "expired" && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-300">Account Locked</p>
            <p className="text-sm text-amber-600 dark:text-amber-400">Subscription expired. Gym is in read-only/locked mode.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setActionType("unlock")}
          >
            <Unlock className="mr-1 h-3 w-3" /> Unlock
          </Button>
        </div>
      )}

      {gym.subscription_status === "trial" && gym.days_remaining !== null && gym.days_remaining <= 3 && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
          <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="font-medium text-blue-800 dark:text-blue-300">Trial Expiring Soon</p>
            <p className="text-sm text-blue-600 dark:text-blue-400">
              {gym.days_remaining} day{gym.days_remaining !== 1 ? "s" : ""} remaining in trial. Trial ends {gym.trial_end}.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setActionType("extend_trial")}
          >
            <RefreshCw className="mr-1 h-3 w-3" /> Extend
          </Button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Members"
          value={gym.member_count}
          subtitle={`${gym.active_member_count} active`}
          icon={Users}
          iconClassName="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
        />
        <MetricCard
          title="Staff Users"
          value={gym.staff_count}
          icon={Shield}
          iconClassName="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
        />
        <MetricCard
          title="Total Revenue"
          value={formatPaise(gym.total_revenue_in_paise)}
          icon={CreditCard}
          iconClassName="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
        />
        <MetricCard
          title="Days Remaining"
          value={gym.days_remaining ?? "—"}
          subtitle={gym.subscription_status === "trial" ? "Trial period" : "Billing period"}
          icon={Calendar}
          iconClassName="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Gym Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Gym Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{gym.name}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{gym.phone}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{gym.email || "—"}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Address</span>
              <span className="font-medium">{gym.address || "—"}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">City</span>
              <span className="font-medium">{gym.city || "—"}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Registered</span>
              <span className="font-medium">
                {gym.created_at ? new Date(gym.created_at).toLocaleDateString() : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Owner Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Owner Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gym.owner ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{gym.owner.name}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{gym.owner.email}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium">{gym.owner.phone}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No owner found</p>
            )}
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              Subscription
            </CardTitle>
            <div className="flex gap-2">
              <SubscriptionBadge status={gym.subscription_status} />
              <PlanBadge tier={gym.plan_tier} name={gym.plan_name} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {gym.subscription_status === "trial" && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trial Start</span>
                  <span className="font-medium">{gym.trial_start || "—"}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trial End</span>
                  <span className="font-medium">{gym.trial_end || "—"}</span>
                </div>
              </>
            )}
            {gym.current_period_start && (
              <>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Period Start</span>
                  <span className="font-medium">{gym.current_period_start}</span>
                </div>
              </>
            )}
            {gym.current_period_end && (
              <>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Period End</span>
                  <span className="font-medium">{gym.current_period_end}</span>
                </div>
              </>
            )}
            {gym.cancel_at_period_end && (
              <>
                <Separator />
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Cancels at period end</span>
                </div>
              </>
            )}
            <Separator />
            <div className="flex flex-wrap gap-2 pt-2">
              {gym.subscription_status === "trial" && (
                <Button size="sm" variant="outline" onClick={() => setActionType("extend_trial")}>
                  Extend Trial
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setActionType("change_plan")}>
                Change Plan
              </Button>
              {gym.subscription_status !== "active" && (
                <Button size="sm" onClick={() => setActionType("activate")}>
                  Activate
                </Button>
              )}
              {gym.is_active ? (
                <Button size="sm" variant="destructive" onClick={() => setActionType("suspend")}>
                  <Pause className="mr-1 h-3 w-3" /> Suspend
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setActionType("unsuspend")}>
                  <Play className="mr-1 h-3 w-3" /> Unsuspend
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Staff */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Staff ({gym.staff.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gym.staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff members</p>
            ) : (
              <div className="space-y-3">
                {gym.staff.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">{s.role}</Badge>
                      {!s.is_active && <Badge variant="destructive">Inactive</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment History (SaaS Invoices)</CardTitle>
        </CardHeader>
        <CardContent>
          {gym.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Invoice</th>
                    <th className="px-3 py-2 text-left font-medium">Period</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {gym.invoices.map((inv) => (
                    <tr key={inv.id} className="border-b">
                      <td className="px-3 py-2 font-mono text-xs">{inv.invoice_number}</td>
                      <td className="px-3 py-2 text-xs">
                        {inv.period_start} → {inv.period_end}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatPaise(inv.amount_in_paise)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            inv.status === "paid"
                              ? "success"
                              : inv.status === "failed"
                              ? "destructive"
                              : "secondary"
                          }
                          className="capitalize"
                        >
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscription Timeline */}
      {gym.subscription_timeline && gym.subscription_timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              Subscription Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-4 pl-6 before:absolute before:left-2 before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-border">
              {gym.subscription_timeline.map((entry, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[18px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" />
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-3">
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {entry.date ? new Date(entry.date).toLocaleString() : "—"}
                    </span>
                    <div>
                      <Badge variant="outline" className="mb-1 text-xs capitalize">
                        {entry.action.replace(/_/g, " ")}
                      </Badge>
                      <p className="text-sm">{entry.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Dialog */}
      <Dialog open={!!actionType} onOpenChange={(open) => !open && closeAction()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "suspend" && "Suspend Gym"}
              {actionType === "unsuspend" && "Unsuspend Gym"}
              {actionType === "extend_trial" && "Extend Trial"}
              {actionType === "lock" && "Lock Gym"}
              {actionType === "unlock" && "Unlock Gym"}
              {actionType === "change_plan" && "Change Plan"}
              {actionType === "activate" && "Activate Subscription"}
            </DialogTitle>
            <DialogDescription>
              {gym.name} — This action will be logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {actionType === "extend_trial" && (
              <div>
                <Label htmlFor="trial-days">Days to extend</Label>
                <Input
                  id="trial-days"
                  type="number"
                  min={1}
                  max={90}
                  value={trialDays}
                  onChange={(e) => setTrialDays(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
            )}
            {actionType === "change_plan" && (
              <div>
                <Label htmlFor="new-plan">New Plan</Label>
                <Select value={newPlan} onValueChange={setNewPlan}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="elite">Elite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {actionType !== "activate" && (
              <div>
                <Label htmlFor="action-reason">Reason</Label>
                <Textarea
                  id="action-reason"
                  placeholder="Enter reason for this action..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAction}>
              Cancel
            </Button>
            <Button
              onClick={executeAction}
              disabled={(actionType !== "activate" && !reason.trim()) || isActionPending}
              variant={actionType === "suspend" || actionType === "lock" ? "destructive" : "default"}
            >
              {isActionPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
