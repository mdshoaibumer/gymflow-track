"use client";

/**
 * Membership Plans — gym-scoped plan definitions backed by the API.
 * Plans are stored in the database and shared across all devices/staff.
 *
 * Migration note: Previously plans were stored in localStorage.
 * This module now calls the backend API for persistence.
 * The localStorage fallback is kept only for offline/migration scenarios.
 */

import { api } from "@/lib/api";

export interface MembershipPlan {
  id: string;
  name: string;
  duration_months: number;
  amount: number; // in rupees
}

interface MembershipPlanListResponse {
  plans: MembershipPlan[];
}

// === API-backed functions ===

export async function fetchPlans(): Promise<MembershipPlan[]> {
  try {
    const response = await api.get<MembershipPlanListResponse>("/membership-plans");
    return response.data.plans;
  } catch {
    // Fallback to localStorage if API unavailable (offline scenario)
    return getPlansFromStorage();
  }
}

export async function createPlan(plan: Omit<MembershipPlan, "id">): Promise<MembershipPlan> {
  const response = await api.post<MembershipPlan>("/membership-plans", plan);
  return response.data;
}

export async function updatePlanApi(
  id: string,
  updates: Partial<Omit<MembershipPlan, "id">>
): Promise<MembershipPlan> {
  const response = await api.patch<MembershipPlan>(`/membership-plans/${id}`, updates);
  return response.data;
}

export async function deletePlanApi(id: string): Promise<void> {
  await api.delete(`/membership-plans/${id}`);
}

// === Legacy localStorage functions (kept for backward compat during migration) ===

const STORAGE_KEY_PREFIX = "gym_plans_";

function getStorageKey(gymId?: string): string {
  return `${STORAGE_KEY_PREFIX}${gymId || "default"}`;
}

export function getPlansFromStorage(gymId?: string): MembershipPlan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(gymId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Migrate plans from localStorage to database (one-time operation).
 * Call this on app init to move existing plans to the server.
 */
export async function migrateLocalStoragePlans(gymId?: string): Promise<void> {
  const localPlans = getPlansFromStorage(gymId);
  if (localPlans.length === 0) return;

  try {
    // Fetch server plans to avoid duplicates
    const serverPlans = await fetchPlans();
    const serverPlanNames = new Set(serverPlans.map((p) => p.name.toLowerCase()));

    for (const plan of localPlans) {
      if (!serverPlanNames.has(plan.name.toLowerCase())) {
        await createPlan({
          name: plan.name,
          duration_months: plan.duration_months,
          amount: plan.amount,
        });
      }
    }

    // Clear localStorage after successful migration
    if (typeof window !== "undefined") {
      localStorage.removeItem(getStorageKey(gymId));
    }
  } catch {
    // If migration fails, keep localStorage data — will retry next time
  }
}

// === Deprecated — kept for any code still using synchronous API ===

/** @deprecated Use fetchPlans() instead */
export function getPlans(gymId?: string): MembershipPlan[] {
  return getPlansFromStorage(gymId);
}

/** @deprecated Use createPlan() instead */
export function addPlan(plan: Omit<MembershipPlan, "id">, gymId?: string): MembershipPlan[] {
  const plans = getPlansFromStorage(gymId);
  const newPlan: MembershipPlan = { ...plan, id: crypto.randomUUID() };
  const updated = [...plans, newPlan];
  if (typeof window !== "undefined") {
    localStorage.setItem(getStorageKey(gymId), JSON.stringify(updated));
  }
  return updated;
}

/** @deprecated Use updatePlanApi() instead */
export function updatePlan(id: string, updates: Partial<Omit<MembershipPlan, "id">>, gymId?: string): MembershipPlan[] {
  const plans = getPlansFromStorage(gymId);
  const updated = plans.map((p) => (p.id === id ? { ...p, ...updates } : p));
  if (typeof window !== "undefined") {
    localStorage.setItem(getStorageKey(gymId), JSON.stringify(updated));
  }
  return updated;
}

/** @deprecated Use deletePlanApi() instead */
export function deletePlan(id: string, gymId?: string): MembershipPlan[] {
  const plans = getPlansFromStorage(gymId).filter((p) => p.id !== id);
  if (typeof window !== "undefined") {
    localStorage.setItem(getStorageKey(gymId), JSON.stringify(plans));
  }
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
