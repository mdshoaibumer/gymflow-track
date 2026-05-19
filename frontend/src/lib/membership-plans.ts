"use client";

/**
 * Membership Plans — gym-scoped plan definitions stored in localStorage.
 * Each plan has a name, duration, and amount.
 */

export interface MembershipPlan {
  id: string;
  name: string;
  duration_months: number;
  amount: number; // in rupees
}

const STORAGE_KEY_PREFIX = "gym_plans_";

function getStorageKey(gymId?: string): string {
  return `${STORAGE_KEY_PREFIX}${gymId || "default"}`;
}

export function getPlans(gymId?: string): MembershipPlan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(gymId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePlans(plans: MembershipPlan[], gymId?: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(getStorageKey(gymId), JSON.stringify(plans));
}

export function addPlan(plan: Omit<MembershipPlan, "id">, gymId?: string): MembershipPlan[] {
  const plans = getPlans(gymId);
  const newPlan: MembershipPlan = {
    ...plan,
    id: crypto.randomUUID(),
  };
  const updated = [...plans, newPlan];
  savePlans(updated, gymId);
  return updated;
}

export function updatePlan(id: string, updates: Partial<Omit<MembershipPlan, "id">>, gymId?: string): MembershipPlan[] {
  const plans = getPlans(gymId);
  const updated = plans.map((p) => (p.id === id ? { ...p, ...updates } : p));
  savePlans(updated, gymId);
  return updated;
}

export function deletePlan(id: string, gymId?: string): MembershipPlan[] {
  const plans = getPlans(gymId).filter((p) => p.id !== id);
  savePlans(plans, gymId);
  return plans;
}

/**
 * Calculate end date given a start date and duration in months.
 */
export function calculateEndDate(startDate: string, durationMonths: number): string {
  const date = new Date(startDate);
  date.setMonth(date.getMonth() + durationMonths);
  return date.toISOString().split("T")[0];
}
