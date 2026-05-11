"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "secondary" | "outline" }> = {
  trial: { label: "Trial", variant: "default" },
  active: { label: "Active", variant: "success" },
  past_due: { label: "Past Due", variant: "warning" },
  cancelled: { label: "Cancelled", variant: "secondary" },
  expired: { label: "Expired", variant: "destructive" },
  grace_period: { label: "Grace Period", variant: "warning" },
  read_only: { label: "Read Only", variant: "warning" },
  locked: { label: "Locked", variant: "destructive" },
  suspended: { label: "Suspended", variant: "destructive" },
};

interface SubscriptionBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export function SubscriptionBadge({ status, className }: SubscriptionBadgeProps) {
  if (!status) {
    return <Badge variant="outline" className={className}>No Subscription</Badge>;
  }

  const config = statusConfig[status] || { label: status, variant: "outline" as const };

  return (
    <Badge variant={config.variant} className={cn("capitalize", className)}>
      {config.label}
    </Badge>
  );
}

interface PlanBadgeProps {
  tier: string | null | undefined;
  name?: string | null;
  className?: string;
}

export function PlanBadge({ tier, name, className }: PlanBadgeProps) {
  if (!tier) {
    return <Badge variant="outline" className={className}>No Plan</Badge>;
  }

  const variant = tier === "pro" ? "default" : tier === "elite" ? "default" : "secondary";

  return (
    <Badge variant={variant} className={cn("capitalize", className)}>
      {name || tier}
    </Badge>
  );
}

interface ActiveStatusBadgeProps {
  isActive: boolean;
  className?: string;
}

export function ActiveStatusBadge({ isActive, className }: ActiveStatusBadgeProps) {
  return (
    <Badge
      variant={isActive ? "success" : "destructive"}
      className={className}
    >
      {isActive ? "Active" : "Suspended"}
    </Badge>
  );
}
