"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  paymentFormSchema,
  type PaymentFormValues,
} from "@/lib/validations/payment";
import type { Member } from "@/services/member.service";

interface PaymentFormProps {
  members: Member[];
  defaultMemberId?: string;
  onSubmit: (values: PaymentFormValues) => Promise<void>;
  onCancel: () => void;
}

export function PaymentForm({
  members,
  defaultMemberId,
  onSubmit,
  onCancel,
}: PaymentFormProps) {
  const {
    register,
    handleSubmit,
    watch,
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

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">Record Payment</h2>

      <form
        onSubmit={handleSubmit((data) => onSubmit(data as PaymentFormValues))}
        className="grid gap-4 sm:grid-cols-2"
      >
        {/* Member */}
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Member *</label>
          <select
            {...register("member_id")}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select member</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.phone}
              </option>
            ))}
          </select>
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
