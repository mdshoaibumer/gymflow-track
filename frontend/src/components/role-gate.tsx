"use client";

import type { UserRole } from "@/types";
import { useAuth } from "@/hooks/use-auth";

interface RoleGateProps {
  /** Roles allowed to see the children */
  allowed: UserRole[];
  /** Content shown when role is sufficient */
  children: React.ReactNode;
  /** Optional fallback when role is insufficient */
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children based on the current user's role.
 *
 * IMPORTANT: This is UI-only gating. The server enforces real access control.
 * This prevents showing buttons/actions that would 403 on the backend.
 *
 * Usage:
 *   <RoleGate allowed={["owner", "admin"]}>
 *     <DeleteButton />
 *   </RoleGate>
 */
export function RoleGate({ allowed, children, fallback = null }: RoleGateProps) {
  const { role } = useAuth();

  if (!role || !allowed.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
