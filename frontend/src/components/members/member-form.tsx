"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { memberFormSchema, type MemberFormValues } from "@/lib/validations/member";
import type { Member } from "@/services/member.service";

interface MemberFormProps {
  defaultValues?: Partial<MemberFormValues>;
  onSubmit: (data: MemberFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  title: string;
}

/**
 * Reusable member form for create + edit operations.
 * Uses React Hook Form + Zod for validated, performant form handling.
 */
export function MemberForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
  title,
}: MemberFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      gender: "" as const,
      membership_plan: "",
      membership_start: "",
      membership_end: "",
      amount_paid: 0,
      ...defaultValues,
    },
  });

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    try {
      await onSubmit(data as MemberFormValues);
    } catch (err) {
      setError("root", {
        message: err instanceof Error ? err.message : "An error occurred",
      });
    }
  };

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>

      {errors.root && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
          {errors.root.message}
        </div>
      )}

      <form
        onSubmit={handleSubmit(handleFormSubmit)}
        className="grid gap-4 sm:grid-cols-2"
      >
        <div>
          <label htmlFor="name" className="text-sm font-medium">
            Name *
          </label>
          <input
            id="name"
            {...register("name")}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
            placeholder="Member name"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="text-sm font-medium">
            Phone *
          </label>
          <input
            id="phone"
            {...register("phone")}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
            placeholder="9876543210"
          />
          {errors.phone && (
            <p className="mt-1 text-xs text-destructive">{errors.phone.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            {...register("email")}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
            placeholder="member@email.com"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="gender" className="text-sm font-medium">
            Gender
          </label>
          <select
            id="gender"
            {...register("gender")}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm bg-background"
          >
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="membership_plan" className="text-sm font-medium">
            Plan
          </label>
          <input
            id="membership_plan"
            {...register("membership_plan")}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
            placeholder="Monthly / Quarterly / Annual"
          />
        </div>

        <div>
          <label htmlFor="amount_paid" className="text-sm font-medium">
            Amount Paid (₹)
          </label>
          <input
            id="amount_paid"
            type="number"
            min="0"
            {...register("amount_paid")}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
            placeholder="2000"
          />
          {errors.amount_paid && (
            <p className="mt-1 text-xs text-destructive">{errors.amount_paid.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="membership_start" className="text-sm font-medium">
            Start Date
          </label>
          <input
            id="membership_start"
            type="date"
            {...register("membership_start")}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="membership_end" className="text-sm font-medium">
            End Date
          </label>
          <input
            id="membership_end"
            type="date"
            {...register("membership_end")}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          />
        </div>

        <div className="sm:col-span-2 flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : submitLabel}
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

/** Convert a Member to form default values (handles paise→rupees conversion). */
export function memberToFormValues(member: Member): Partial<MemberFormValues> {
  return {
    name: member.name,
    phone: member.phone,
    email: member.email || "",
    gender: member.gender || "",
    membership_plan: member.membership_plan || "",
    membership_start: member.membership_start || "",
    membership_end: member.membership_end || "",
    amount_paid: member.amount_paid / 100,
  };
}
