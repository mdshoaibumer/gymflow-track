"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-billing";

/**
 * Billing status banner — shows contextual alerts across all dashboard pages.
 *
 * Displays:
 * - Trial countdown (< 7 days remaining)
 * - Past due warning
 * - Expired/locked notice
 * - Cancelled notice with end date
 *
 * UX philosophy: Transparent, not aggressive. No dark patterns.
 * We inform, not threaten. The value speaks for itself.
 */
export function BillingBanner() {
  const { isOwner } = useAuth();
  const { data: subscription } = useSubscription();

  if (!subscription) return null;

  const { status, is_trial, days_remaining, cancel_at_period_end, current_period_end } = subscription;

  // Trial ending soon (< 7 days)
  if (is_trial && days_remaining !== null && days_remaining <= 7) {
    return (
      <div className={`px-4 py-2 text-sm text-center ${
        days_remaining <= 2 ? "bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200" : "bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200"
      }`}>
        {days_remaining === 0
          ? "Your free trial expires today! "
          : `${days_remaining} day${days_remaining !== 1 ? "s" : ""} left in your free trial. `}
        {isOwner && (
          <Link href="/billing" className="font-medium underline">
            Subscribe now
          </Link>
        )}
      </div>
    );
  }

  // Past due
  if (status === "past_due") {
    return (
      <div className="bg-red-50 dark:bg-red-950/50 px-4 py-2 text-sm text-center text-red-800 dark:text-red-200">
        Payment overdue. We&apos;re retrying automatically.{" "}
        {isOwner && (
          <Link href="/billing/manage" className="font-medium underline">
            Update payment
          </Link>
        )}
      </div>
    );
  }

  // Cancelled but still active
  if (status === "cancelled" || cancel_at_period_end) {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/50 px-4 py-2 text-sm text-center text-amber-800 dark:text-amber-200">
        Your subscription is cancelled. Access continues until{" "}
        {current_period_end
          ? new Date(current_period_end).toLocaleDateString("en-IN")
          : "the end of your billing period"}.{" "}
        {isOwner && (
          <Link href="/billing" className="font-medium underline">
            Resubscribe
          </Link>
        )}
      </div>
    );
  }

  // Expired
  if (status === "expired") {
    return (
      <div className="bg-red-50 dark:bg-red-950/50 px-4 py-2 text-sm text-center text-red-800 dark:text-red-200">
        Your subscription has expired. Some features are restricted.{" "}
        {isOwner && (
          <Link href="/billing" className="font-medium underline">
            Reactivate now
          </Link>
        )}
      </div>
    );
  }

  return null;
}
