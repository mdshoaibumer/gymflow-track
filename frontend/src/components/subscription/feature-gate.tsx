"use client";

import { useFeatureAccess } from "@/hooks/use-feature-access";
import type { FeatureName } from "@/services/billing.service";
import { LockedFeatureCard } from "./locked-feature-card";

interface FeatureGateProps {
  /** Feature to check access for */
  feature: FeatureName;
  /** Content to render when feature is available */
  children: React.ReactNode;
  /** Optional custom fallback (default: LockedFeatureCard) */
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children based on the current plan's feature access.
 *
 * IMPORTANT: This is UI-only gating. The server enforces real access control.
 * This prevents showing functionality that would 403 on the backend.
 *
 * Usage:
 *   <FeatureGate feature="qr_attendance">
 *     <QRAttendancePage />
 *   </FeatureGate>
 */
export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { allowed, isLoading } = useFeatureAccess(feature);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!allowed) {
    return <>{fallback ?? <LockedFeatureCard feature={feature} />}</>;
  }

  return <>{children}</>;
}
