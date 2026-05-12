"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Search,
  Building2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Pause,
  Play,
  Lock,
  Unlock,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubscriptionBadge, PlanBadge, ActiveStatusBadge } from "@/components/admin/status-badges";
import { useAdminGyms, useSuspendGym, useUnsuspendGym, useExtendTrial, useLockGym, useUnlockGym } from "@/hooks/use-admin";
import { formatPaise } from "@/lib/utils";
import type { GymDirectoryItem } from "@/services/admin.service";

const PAGE_SIZE = 20;

type ActionType = "suspend" | "unsuspend" | "extend_trial" | "lock" | "unlock" | null;

export default function GymDirectoryPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Action dialog state
  const [actionType, setActionType] = useState<ActionType>(null);
  const [targetGym, setTargetGym] = useState<GymDirectoryItem | null>(null);
  const [reason, setReason] = useState("");
  const [trialDays, setTrialDays] = useState(7);

  const { data, isLoading } = useAdminGyms({
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const suspendMutation = useSuspendGym();
  const unsuspendMutation = useUnsuspendGym();
  const extendTrialMutation = useExtendTrial();
  const lockMutation = useLockGym();
  const unlockMutation = useUnlockGym();

  // Debounce search
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(0);
    const timer = setTimeout(() => setDebouncedSearch(value), 300);
    return () => clearTimeout(timer);
  }, []);

  const openAction = (type: ActionType, gym: GymDirectoryItem) => {
    setActionType(type);
    setTargetGym(gym);
    setReason("");
    setTrialDays(7);
  };

  const closeAction = () => {
    setActionType(null);
    setTargetGym(null);
    setReason("");
  };

  const executeAction = async () => {
    if (!targetGym || !reason.trim()) return;

    switch (actionType) {
      case "suspend":
        await suspendMutation.mutateAsync({ gymId: targetGym.id, reason });
        break;
      case "unsuspend":
        await unsuspendMutation.mutateAsync({ gymId: targetGym.id, reason });
        break;
      case "extend_trial":
        await extendTrialMutation.mutateAsync({ gymId: targetGym.id, days: trialDays, reason });
        break;
      case "lock":
        await lockMutation.mutateAsync({ gymId: targetGym.id, reason });
        break;
      case "unlock":
        await unlockMutation.mutateAsync({ gymId: targetGym.id, newStatus: "active", reason });
        break;
    }
    closeAction();
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const isActionPending =
    suspendMutation.isPending ||
    unsuspendMutation.isPending ||
    extendTrialMutation.isPending ||
    lockMutation.isPending ||
    unlockMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gym Directory</h1>
        <p className="text-muted-foreground">
          Manage all registered gyms on the platform.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search gyms by name or email..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-4 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : !data || data.gyms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Building2 className="mb-4 h-12 w-12 opacity-30" />
              <p className="text-lg font-medium">No gyms found</p>
              <p className="text-sm">
                {debouncedSearch ? "Try a different search term" : "No gyms registered yet"}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Gym</th>
                      <th className="px-4 py-3 text-left font-medium">Owner</th>
                      <th className="px-4 py-3 text-left font-medium">Plan</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-right font-medium">Members</th>
                      <th className="px-4 py-3 text-right font-medium">Staff</th>
                      <th className="px-4 py-3 text-right font-medium">Revenue</th>
                      <th className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.gyms.map((gym) => (
                      <motion.tr
                        key={gym.id}
                        className="border-b transition-colors hover:bg-muted/30"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <td className="px-4 py-3">
                          <div>
                            <Link
                              href={`/admin/gyms/${gym.id}`}
                              className="font-medium text-foreground hover:text-primary hover:underline"
                            >
                              {gym.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">{gym.city || gym.email || gym.slug}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {gym.owner ? (
                            <div>
                              <p className="font-medium">{gym.owner.name}</p>
                              <p className="text-xs text-muted-foreground">{gym.owner.email}</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <PlanBadge tier={gym.plan_tier} name={gym.plan_name} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <SubscriptionBadge status={gym.subscription_status} />
                            {!gym.is_active && <ActiveStatusBadge isActive={false} />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {gym.member_count}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {gym.active_staff}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatPaise(gym.revenue_in_paise)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <GymActions gym={gym} onAction={openAction} />
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 p-4 md:hidden">
                {data.gyms.map((gym) => (
                  <Card key={gym.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <Link
                            href={`/admin/gyms/${gym.id}`}
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {gym.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {gym.owner?.name || "No owner"} · {gym.city || "—"}
                          </p>
                        </div>
                        <GymActions gym={gym} onAction={openAction} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <SubscriptionBadge status={gym.subscription_status} />
                        <PlanBadge tier={gym.plan_tier} name={gym.plan_name} />
                        {!gym.is_active && <ActiveStatusBadge isActive={false} />}
                      </div>
                      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                        <span>{gym.member_count} members</span>
                        <span>{formatPaise(gym.revenue_in_paise)} revenue</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
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
            </DialogTitle>
            <DialogDescription>
              {targetGym?.name} — This action will be logged in the audit trail.
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
            <div>
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for this action..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAction}>
              Cancel
            </Button>
            <Button
              onClick={executeAction}
              disabled={!reason.trim() || isActionPending}
              variant={actionType === "suspend" || actionType === "lock" ? "destructive" : "default"}
            >
              {isActionPending ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GymActions({
  gym,
  onAction,
}: {
  gym: GymDirectoryItem;
  onAction: (type: ActionType, gym: GymDirectoryItem) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/admin/gyms/${gym.id}`}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </Link>
        </DropdownMenuItem>
        {gym.owner && (
          <DropdownMenuItem asChild>
            <Link href={`/admin/gyms/${gym.id}?impersonate=true`}>
              <UserCheck className="mr-2 h-4 w-4" />
              Impersonate Owner
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {gym.subscription_status === "trial" && (
          <DropdownMenuItem onClick={() => onAction("extend_trial", gym)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Extend Trial
          </DropdownMenuItem>
        )}
        {gym.is_active ? (
          <DropdownMenuItem
            onClick={() => onAction("suspend", gym)}
            className="text-destructive"
          >
            <Pause className="mr-2 h-4 w-4" />
            Suspend Gym
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onAction("unsuspend", gym)}>
            <Play className="mr-2 h-4 w-4" />
            Unsuspend Gym
          </DropdownMenuItem>
        )}
        {gym.subscription_status !== "expired" ? (
          <DropdownMenuItem
            onClick={() => onAction("lock", gym)}
            className="text-destructive"
          >
            <Lock className="mr-2 h-4 w-4" />
            Lock Account
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onAction("unlock", gym)}>
            <Unlock className="mr-2 h-4 w-4" />
            Unlock Account
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
