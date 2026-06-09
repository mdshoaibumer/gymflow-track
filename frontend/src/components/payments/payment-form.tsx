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
import { useMembershipPlans } from "@/hooks/use-membership-plans";
import { calculateEndDate } from "@/lib/membership-plans";
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
      discount: 0,
      payment_method: "cash" as const,
      payment_status: "completed" as const,
      payment_date: new Date().toISOString().split("T")[0],
      notes: "",
      membership_plan: "",
      membership_start: "",
      membership_end: "",
    },
  });

  const watchedStatus = watch("payment_status");
  const isPending = watchedStatus === "pending";
  const showRenewal = true; // Always show plan section — needed for both completed & pending

  // Live payment breakdown
  const watchedAmount = watch("amount") || 0;
  const watchedDiscount = watch("discount") || 0;
  const watchedPlan = watch("membership_plan");
  const selectedPlan = plans.find((p) => p.name === watchedPlan);
  const planPrice = selectedPlan?.amount ?? 0;
  const effectiveDue = planPrice > 0 ? planPrice - watchedDiscount : 0;
  const remainingBalance = effectiveDue > 0 ? effectiveDue - watchedAmount : 0;

  // --- Membership plans from settings (API-backed) ---
  const { data: plans = [] } = useMembershipPlans();

  const handlePlanSelect = (planId: string) => {
    const plan = plans.find((p) => p.id === planId);
    if (plan) {
      setValue("membership_plan", plan.name);
      setValue("amount", isPending ? 0 : plan.amount);
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
          <Label>Amount (₹) {isPending ? "" : "*"}</Label>
          <Input
            type="number"
            step="1"
            min="0"
            {...register("amount", { valueAsNumber: true })}
            placeholder={isPending ? "0" : "2000"}
          />
          {isPending && (
            <p className="text-xs text-muted-foreground">
              Enter 0 if no advance collected. Full amount tracked in Collections.
            </p>
          )}
          {errors.amount && (
            <p className="text-xs text-destructive">
              {errors.amount.message}
            </p>
          )}
        </div>

        {/* Discount */}
        <div className="space-y-1.5">
          <Label>Discount (₹)</Label>
          <Input
            type="number"
            step="1"
            min="0"
            {...register("discount", { valueAsNumber: true })}
            placeholder="0"
          />
          {errors.discount && (
            <p className="text-xs text-destructive">
              {errors.discount.message}
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
            <option value="pending">Pending (Pay Later)</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            {isPending
              ? "Member will pay later. Full plan amount will be tracked as outstanding in Collections."
              : "Payment received. If amount is less than plan price, remaining balance auto-tracked in Collections."
            }
          </p>
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

        {/* Payment Breakdown — shows when a plan is selected */}
        {planPrice > 0 && (watchedAmount > 0 || isPending) && (
          <div className="sm:col-span-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Payment Breakdown</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Plan Price</span>
              <span>₹{planPrice.toLocaleString("en-IN")}</span>
            </div>
            {watchedDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-emerald-600">-₹{watchedDiscount.toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-medium border-t border-muted-foreground/20 pt-1 mt-1">
              <span className="text-muted-foreground">Effective Due</span>
              <span>₹{effectiveDue.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{isPending ? "Advance Paid" : "Amount Paying Now"}</span>
              <span>₹{watchedAmount.toLocaleString("en-IN")}</span>
            </div>
            {remainingBalance > 0 && (
              <div className="flex justify-between text-sm font-semibold border-t border-muted-foreground/20 pt-1 mt-1">
                <span className="text-amber-600 dark:text-amber-400">Outstanding Balance</span>
                <span className="text-amber-600 dark:text-amber-400">₹{remainingBalance.toLocaleString("en-IN")}</span>
              </div>
            )}
            {remainingBalance > 0 && (
              <p className="text-xs text-muted-foreground mt-1.5 italic">
                {isPending
                  ? `💡 ₹${remainingBalance.toLocaleString("en-IN")} will appear in Collections. Collect when member pays.`
                  : `💡 The remaining ₹${remainingBalance.toLocaleString("en-IN")} will be automatically tracked in Collections as an outstanding due.`
                }
              </p>
            )}
            {remainingBalance <= 0 && watchedAmount >= effectiveDue && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 font-medium">
                ✓ Fully paid — no outstanding balance.
              </p>
            )}
          </div>
        )}

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
