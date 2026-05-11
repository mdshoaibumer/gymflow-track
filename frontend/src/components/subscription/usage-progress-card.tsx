"use client";

import { Users, UserCog, Infinity } from "lucide-react";

interface UsageProgressCardProps {
  /** Label for the resource */
  label: string;
  /** Current count */
  current: number;
  /** Maximum allowed */
  max: number;
  /** Whether this resource is unlimited */
  isUnlimited?: boolean;
  /** Usage percentage (0-100) */
  percent: number;
  /** Icon variant */
  variant?: "members" | "staff";
}

/**
 * Visual usage progress card showing current/max with animated bar.
 */
export function UsageProgressCard({
  label,
  current,
  max,
  isUnlimited = false,
  percent,
  variant = "members",
}: UsageProgressCardProps) {
  const Icon = variant === "members" ? Users : UserCog;

  const barColor = isUnlimited
    ? "bg-emerald-500"
    : percent >= 100
      ? "bg-red-500"
      : percent >= 95
        ? "bg-orange-500"
        : percent >= 80
          ? "bg-amber-500"
          : "bg-primary";

  const textColor = isUnlimited
    ? "text-emerald-600 dark:text-emerald-400"
    : percent >= 95
      ? "text-red-600 dark:text-red-400"
      : percent >= 80
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className={`text-xs ${textColor}`}>
              {isUnlimited ? (
                <span className="inline-flex items-center gap-1">
                  <Infinity className="h-3 w-3" /> Unlimited
                </span>
              ) : (
                `${max - current >= 0 ? max - current : 0} remaining`
              )}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{current}</p>
          <p className="text-xs text-muted-foreground">
            {isUnlimited ? "active" : `of ${max}`}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {!isUnlimited && (
        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out ${barColor}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} usage: ${percent}%`}
          />
        </div>
      )}

      {isUnlimited && (
        <div className="relative h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <div className="absolute inset-0 rounded-full bg-emerald-500/30" />
        </div>
      )}
    </div>
  );
}
