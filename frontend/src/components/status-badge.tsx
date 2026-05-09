/************************************************************
Component Name : Status Badge

Purpose        : Reusable status badge component that maps a status
                 string to a color-coded badge variant. Supports
                 membership statuses (active, expired, frozen, etc.),
                 payment statuses (completed, pending, failed), and
                 subscription statuses. Eliminates duplicated badge
                 logic across members, payments, and billing pages.

Author         : Mohammed Shoaib U
************************************************************/

import { Badge, type BadgeProps } from "@/components/ui/badge";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  // Membership statuses
  active: "success",
  expired: "destructive",
  frozen: "warning",
  pending: "secondary",
  cancelled: "outline",

  // Payment statuses
  completed: "success",
  failed: "destructive",
  refunded: "secondary",

  // Subscription/billing statuses
  trial: "warning",
  past_due: "destructive",
  locked: "destructive",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = STATUS_VARIANTS[status] || "secondary";
  return (
    <Badge variant={variant} className={`capitalize ${className ?? ""}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
