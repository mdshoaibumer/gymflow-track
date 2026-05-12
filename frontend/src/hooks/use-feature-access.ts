"use client";

import { useFeatureLimits } from "@/hooks/use-billing";
import type {
  FeatureLimits,
  FeatureName,
  PlanTier,
} from "@/services/billing.service";
import {
  FEATURE_REQUIRED_PLAN,
  FEATURE_DISPLAY_NAMES,
  FEATURE_DESCRIPTIONS,
} from "@/services/billing.service";

export interface FeatureAccess {
  /** Whether the feature is available on the current plan */
  allowed: boolean;
  /** Current plan tier */
  currentPlan: PlanTier;
  /** Minimum plan required for this feature */
  requiredPlan: PlanTier;
  /** Human-readable feature name */
  featureName: string;
  /** Feature benefits for upgrade prompt */
  benefits: string[];
  /** Whether data is still loading */
  isLoading: boolean;
}

export interface UsageInfo {
  /** Current active member count */
  currentMembers: number;
  /** Maximum members allowed by plan */
  maxMembers: number;
  /** Members remaining before limit */
  membersRemaining: number;
  /** Member usage as percentage (0-100) */
  memberUsagePercent: number;
  /** Whether member limit is reached */
  isAtMemberLimit: boolean;
  /** Whether members are unlimited */
  isUnlimitedMembers: boolean;

  /** Current staff count */
  currentStaff: number;
  /** Maximum staff allowed by plan */
  maxStaff: number;
  /** Staff usage as percentage (0-100) */
  staffUsagePercent: number;
  /** Whether staff limit is reached */
  isAtStaffLimit: boolean;
  /** Whether staff are unlimited */
  isUnlimitedStaff: boolean;

  /** Current plan tier */
  planTier: PlanTier;
  /** Current plan display name */
  planName: string;
  /** Subscription status */
  subscriptionStatus: string;
  /** Days remaining in current period */
  daysRemaining: number | null;
  /** Period end date */
  currentPeriodEnd: string | null;

  /** Full feature limits data */
  limits: FeatureLimits | null;
  /** Whether data is still loading */
  isLoading: boolean;

  /** Usage warning level: 'none' | 'soft' (80%) | 'hard' (95%) | 'limit' (100%) */
  memberWarningLevel: "none" | "soft" | "hard" | "limit";
  /** Usage warning level for staff */
  staffWarningLevel: "none" | "soft" | "hard" | "limit";
}

/**
 * Check if a specific feature is available on the current plan.
 *
 * Usage:
 *   const { allowed, requiredPlan } = useFeatureAccess("qr_attendance");
 *   if (!allowed) return <LockedFeatureCard feature="qr_attendance" />;
 */
export function useFeatureAccess(feature: FeatureName): FeatureAccess {
  const { data: limits, isLoading } = useFeatureLimits();

  if (isLoading || !limits) {
    return {
      allowed: false,
      currentPlan: "none",
      requiredPlan: FEATURE_REQUIRED_PLAN[feature],
      featureName: FEATURE_DISPLAY_NAMES[feature],
      benefits: FEATURE_DESCRIPTIONS[feature],
      isLoading: true,
    };
  }

  const currentPlan = limits.plan_tier as PlanTier;
  const requiredPlan = FEATURE_REQUIRED_PLAN[feature];

  // Check by looking at the actual feature flag from the server
  const featureFlags: Record<FeatureName, boolean> = {
    qr_attendance: limits.qr_attendance_enabled,
    advanced_analytics: limits.advanced_analytics_enabled,
    export_reports: limits.export_reports_enabled,
    multi_branch: limits.multi_branch_enabled,
    automated_whatsapp: limits.automated_whatsapp_enabled,
    advanced_reports: limits.advanced_reports_enabled,
    sms_notifications: limits.sms_notifications_enabled,
  };

  return {
    allowed: featureFlags[feature] ?? false,
    currentPlan,
    requiredPlan,
    featureName: FEATURE_DISPLAY_NAMES[feature],
    benefits: FEATURE_DESCRIPTIONS[feature],
    isLoading: false,
  };
}

/**
 * Get current usage info for members and staff with warning levels.
 *
 * Usage:
 *   const { memberUsagePercent, memberWarningLevel } = useUsageInfo();
 */
export function useUsageInfo(): UsageInfo {
  const { data: limits, isLoading } = useFeatureLimits();

  if (isLoading || !limits) {
    return {
      currentMembers: 0,
      maxMembers: 0,
      membersRemaining: 0,
      memberUsagePercent: 0,
      isAtMemberLimit: false,
      isUnlimitedMembers: false,
      currentStaff: 0,
      maxStaff: 0,
      staffUsagePercent: 0,
      isAtStaffLimit: false,
      isUnlimitedStaff: false,
      planTier: "none",
      planName: "",
      subscriptionStatus: "none",
      daysRemaining: null,
      currentPeriodEnd: null,
      limits: null,
      isLoading: true,
      memberWarningLevel: "none",
      staffWarningLevel: "none",
    };
  }

  const memberPct = limits.member_usage_percent;
  const staffPct = limits.staff_usage_percent;

  return {
    currentMembers: limits.current_members,
    maxMembers: limits.max_members,
    membersRemaining: limits.members_remaining,
    memberUsagePercent: memberPct,
    isAtMemberLimit: limits.is_at_member_limit,
    isUnlimitedMembers: limits.is_unlimited_members,
    currentStaff: limits.current_staff_users,
    maxStaff: limits.max_staff_users,
    staffUsagePercent: staffPct,
    isAtStaffLimit: limits.is_at_staff_limit,
    isUnlimitedStaff: limits.is_unlimited_staff,
    planTier: limits.plan_tier as PlanTier,
    planName: limits.plan_name,
    subscriptionStatus: limits.subscription_status,
    daysRemaining: limits.days_remaining,
    currentPeriodEnd: limits.current_period_end,
    limits,
    isLoading: false,
    memberWarningLevel: getWarningLevel(memberPct, limits.is_unlimited_members),
    staffWarningLevel: getWarningLevel(staffPct, limits.is_unlimited_staff),
  };
}

function getWarningLevel(
  percent: number,
  isUnlimited: boolean
): "none" | "soft" | "hard" | "limit" {
  if (isUnlimited) return "none";
  if (percent >= 100) return "limit";
  if (percent >= 95) return "hard";
  if (percent >= 80) return "soft";
  return "none";
}
