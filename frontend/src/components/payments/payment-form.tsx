"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  paymentFormSchema,
  type PaymentFormValues,
} from "@/lib/validations/payment";
import type { Member } from "@/services/member.service";
import { useMembers } from "@/hooks/use-members";
import { useGym } from "@/hooks/use-gym";
import { getPlans, calculateEndDate, type MembershipPlan } from "@/lib/membership-plans";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface PaymentFormProps {
  members?: Member[];
  defaultMemberId?: string;
  onSubmit: (values: PaymentFormValues) => Promise<void>;
  onCancel: () => void;
}

export function PaymentForm({
  members: staticMembers,
  defaultMemberId,
  onSubmit,
  onCancel,
}: PaymentFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      member_id: defaultMemberId || "",
      amount: undefined as unknown as number,
      payment_method: "cash" as const,
      payment_status: "completed" as const,
      payment_date: new Date().toISOString().split("T")[0],
      notes: "",
      membership_plan: "",
      membership_start: "",
      membership_end: "",
    },
  });

  const showRenewal = watch("payment_status") === "completed";

  // --- Membership plans from settings ---
  const { data: gym } = useGym();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);

  useEffect(() => {
    setPlans(getPlans(gym?.id));
  }, [gym?.id]);

  const handlePlanSelect = (planId: string) => {
    const plan = plans.find((p) => p.id === planId);
    if (plan) {
      setValue("membership_plan", plan.name);
      setValue("amount", plan.amount);
      // Auto-calculate dates
      const today = new Date().toISOString().split("T")[0];
      const start = watch("membership_start") || today;
      setValue("membership_start", start);
      setValue("membership_end", calculateEndDate(start, plan.duration_months));
    }
  };

  // --- Member search combobox state ---
  const [memberSearch, setMemberSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(memberSearch), 300);
    return () => clearTimeout(timer);
  }, [memberSearch]);

  // Server-side search query (only fires when user types 2+ chars)
  const { data: searchResults, isLoading: isSearching } = useMembers(
    { skip: 0, limit: 20, search: debouncedSearch },
    { enabled: debouncedSearch.length >= 2 }
  );

  const memberOptions = searchResults?.members ?? staticMembers ?? [];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelectMember = useCallback(
    (member: Member) => {
      setValue("member_id", member.id);
      setMemberSearch(`${member.name} — ${member.phone}`);
      setShowDropdown(false);
    },
    [setValue]
  );

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">Record Payment</h2>

      <form
        onSubmit={handleSubmit((data) => onSubmit(data as PaymentFormValues))}
        className="grid gap-4 sm:grid-cols-2"
      >
        {/* Member search combobox */}
        <div className="sm:col-span-2" ref={dropdownRef}>
          <label className="text-sm font-medium">Member *</label>
          <input type="hidden" {...register("member_id")} />
          <div className="relative">
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => {
                setMemberSearch(e.target.value);
                setShowDropdown(true);
                if (!e.target.value) {
                  setValue("member_id", "");
                }
              }}
              onFocus={() => {
                if (memberSearch.length >= 2 || memberOptions.length > 0) {
                  setShowDropdown(true);
                }
              }}
              placeholder="Search by name or phone..."
              aria-label="Search members"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {showDropdown && (memberSearch.length >= 2) && (
              <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
                {isSearching ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
                ) : memberOptions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No members found</div>
                ) : (
                  memberOptions.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectMember(m)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-medium">{m.name}</span>
                      <span className="text-muted-foreground">— {m.phone}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {errors.member_id && (
            <p className="mt-1 text-xs text-destructive">
              {errors.member_id.message}
            </p>
          )}
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <Label>Amount (₹) *</Label>
          <Input
            type="number"
            step="1"
            min="1"
            {...register("amount", { valueAsNumber: true })}
            placeholder="2000"
          />
          {errors.amount && (
            <p className="text-xs text-destructive">
              {errors.amount.message}
            </p>
          )}
        </div>

        {/* Payment Method */}
        <div className="space-y-1.5">
          <Label>Payment Method *</Label>
          <select
            {...register("payment_method")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <Label>Status</Label>
          <select
            {...register("payment_status")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="completed">Completed</option>
            <option value="pending">Pending (Due)</option>
          </select>
        </div>

        {/* Date */}
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input
            type="date"
            {...register("payment_date")}
          />
        </div>

        {/* Notes */}
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Notes</Label>
          <Input
            type="text"
            {...register("notes")}
            placeholder="Optional notes..."
          />
        </div>

        {/* Membership Renewal Section */}
        {showRenewal && (
          <>
            <div className="sm:col-span-2 mt-2 border-t" />

            {/* Plan selection from configured plans */}
            {plans.length > 0 && (
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Select Plan</Label>
                <div className="flex flex-wrap gap-2">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => handlePlanSelect(plan.id)}
                      className={`rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent ${
                        watch("membership_plan") === plan.name
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-input"
                      }`}
                    >
                      <span className="font-medium">{plan.name}</span>
                      <span className="ml-1.5 text-muted-foreground">
                        ₹{plan.amount.toLocaleString("en-IN")}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecting a plan auto-fills the amount and dates. You can still edit them below.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Plan Name</Label>
              <Input
                type="text"
                {...register("membership_plan")}
                placeholder="Monthly / Quarterly"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                {...register("membership_start")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input
                type="date"
                {...register("membership_end")}
              />
            </div>
          </>
        )}

        {/* Actions */}
        <div className="sm:col-span-2 flex gap-3 pt-2">
          <Button
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Recording..." : "Record Payment"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
