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

  // --- Member search combobox state ---
  const [memberSearch, setMemberSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
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
      setSelectedMember(member);
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
                  setSelectedMember(null);
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
        <div>
          <label className="text-sm font-medium">Amount (₹) *</label>
          <input
            type="number"
            step="1"
            min="1"
            {...register("amount", { valueAsNumber: true })}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
            placeholder="2000"
          />
          {errors.amount && (
            <p className="mt-1 text-xs text-destructive">
              {errors.amount.message}
            </p>
          )}
        </div>

        {/* Payment Method */}
        <div>
          <label className="text-sm font-medium">Payment Method *</label>
          <select
            {...register("payment_method")}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="text-sm font-medium">Status</label>
          <select
            {...register("payment_status")}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="completed">Completed</option>
            <option value="pending">Pending (Due)</option>
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="text-sm font-medium">Date</label>
          <input
            type="date"
            {...register("payment_date")}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          />
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Notes</label>
          <input
            type="text"
            {...register("notes")}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
            placeholder="Optional notes..."
          />
        </div>

        {/* Membership Renewal Section */}
        {showRenewal && (
          <>
            <div className="sm:col-span-2 mt-2 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">
                Membership Renewal (optional — auto-extends membership)
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Plan</label>
              <input
                type="text"
                {...register("membership_plan")}
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                placeholder="Monthly / Quarterly"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <input
                type="date"
                {...register("membership_start")}
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">End Date</label>
              <input
                type="date"
                {...register("membership_end")}
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        {/* Actions */}
        <div className="sm:col-span-2 flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? "Recording..." : "Record Payment"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
