"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { memberFormSchema, type MemberFormValues } from "@/lib/validations/member";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Member } from "@/services/member.service";
import type { CustomField } from "@/services/custom-field.service";
import { useState } from "react";

interface MemberFormProps {
  defaultValues?: Partial<MemberFormValues>;
  defaultCustomFields?: Record<string, string | number | null>;
  onSubmit: (data: MemberFormValues & { custom_fields?: Record<string, string | number | null> }) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  title: string;
  isPending?: boolean;
}

export function MemberForm({
  defaultValues,
  defaultCustomFields,
  onSubmit,
  onCancel,
  submitLabel,
  title,
  isPending = false,
}: MemberFormProps) {
  const { data: customFieldsData } = useCustomFields();
  const customFields: CustomField[] = customFieldsData?.fields ?? [];

  const [cfValues, setCfValues] = useState<Record<string, string | number | null>>(
    defaultCustomFields ?? {}
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    setError,
  } = useForm({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      gender: "" as const,
      father_name: "",
      batch: "" as const,
      membership_plan: "",
      membership_start: "",
      membership_end: "",
      amount_paid: 0,
      ...defaultValues,
    },
  });

  useUnsavedChanges(isDirty);

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    try {
      const payload = {
        ...(data as MemberFormValues),
        custom_fields: Object.keys(cfValues).length > 0 ? cfValues : undefined,
      };
      await onSubmit(payload);
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
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
          {errors.root.message}
        </div>
      )}

      <form
        onSubmit={handleSubmit(handleFormSubmit)}
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            {...register("name")}
            placeholder="Member name"
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone *</Label>
          <Input
            id="phone"
            {...register("phone")}
            placeholder="9876543210"
          />
          {errors.phone && (
            <p className="text-xs text-destructive">{errors.phone.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            {...register("email")}
            placeholder="member@email.com"
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender</Label>
          <select
            id="gender"
            {...register("gender")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="father_name">Father&apos;s Name</Label>
          <Input
            id="father_name"
            {...register("father_name")}
            placeholder="Father's name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="batch">Batch</Label>
          <select
            id="batch"
            {...register("batch")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Select Batch</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="membership_plan">Plan</Label>
          <Input
            id="membership_plan"
            {...register("membership_plan")}
            placeholder="Monthly / Quarterly / Annual"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="amount_paid">Amount Paid (₹)</Label>
          <Input
            id="amount_paid"
            type="number"
            min="0"
            {...register("amount_paid", { valueAsNumber: true })}
            placeholder="2000"
          />
          {errors.amount_paid && (
            <p className="text-xs text-destructive">{errors.amount_paid.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="membership_start">Start Date</Label>
          <Input
            id="membership_start"
            type="date"
            {...register("membership_start")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="membership_end">End Date</Label>
          <Input
            id="membership_end"
            type="date"
            {...register("membership_end")}
          />
        </div>

        {/* Dynamic Custom Fields */}
        {customFields.map((cf) => (
          <div key={cf.id} className="space-y-1.5">
            <Label htmlFor={`cf_${cf.field_key}`}>
              {cf.label}
              {cf.is_required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {cf.field_type === "dropdown" ? (
              <select
                id={`cf_${cf.field_key}`}
                value={(cfValues[cf.field_key] as string) ?? ""}
                onChange={(e) =>
                  setCfValues({ ...cfValues, [cf.field_key]: e.target.value || null })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Select</option>
                {cf.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`cf_${cf.field_key}`}
                type={cf.field_type === "number" ? "number" : cf.field_type === "date" ? "date" : "text"}
                value={(cfValues[cf.field_key] as string) ?? ""}
                onChange={(e) =>
                  setCfValues({
                    ...cfValues,
                    [cf.field_key]: cf.field_type === "number"
                      ? (e.target.value ? Number(e.target.value) : null)
                      : (e.target.value || null),
                  })
                }
                placeholder={cf.label}
              />
            )}
          </div>
        ))}

        <div className="sm:col-span-2 flex gap-3 pt-2">
          <Button
            type="submit"
            disabled={isSubmitting || isPending}
          >
            {(isSubmitting || isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {isSubmitting || isPending ? "Saving..." : submitLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting || isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Convert a Member to form default values (handles paise→rupees conversion). */
export function memberToFormValues(member: Member): {
  formValues: Partial<MemberFormValues>;
  customFieldValues: Record<string, string | number | null>;
} {
  return {
    formValues: {
      name: member.name,
      phone: member.phone,
      email: member.email || "",
      gender: member.gender || "",
      father_name: member.father_name || "",
      batch: member.batch || "",
      membership_plan: member.membership_plan || "",
      membership_start: member.membership_start || "",
      membership_end: member.membership_end || "",
      amount_paid: member.amount_paid / 100,
    },
    customFieldValues: member.custom_fields ?? {},
  };
}
