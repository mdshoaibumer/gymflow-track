import { z } from "zod";

/**
 * Normalize an Indian phone number to canonical 10-digit format.
 *
 * Mirrors the backend's `normalize_phone()` so the user sees the same
 * validation result in the browser before the form is submitted.
 * Strips: +91 prefix, leading 0, spaces, dashes, parentheses.
 */
export function normalizePhone(raw: string): string {
  // Remove all non-digit characters
  let digits = raw.replace(/\D/g, "");
  // Strip country code prefix (91) if present and result would be 10 digits
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  // Strip leading 0 (some users type 09876...)
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits;
}

/**
 * Zod schema for member form validation.
 * Mirrors backend Pydantic MemberCreateRequest exactly.
 *
 * Phone pattern: Indian mobile (starts with 6-9, 10 digits)
 * Phone is normalized before validation (strips +91, spaces, dashes).
 */
export const memberFormSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(200, "Name is too long"),
  phone: z
    .string()
    .transform(normalizePhone)
    .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number")),
  email: z.union([z.literal(""), z.string().email("Enter a valid email")]).optional(),
  gender: z.enum(["male", "female", "other", ""]).optional(),
  father_name: z.string().max(200).optional().or(z.literal("")),
  batch: z.enum(["morning", "evening", "afternoon", ""]).optional(),
  membership_plan: z.string().max(100).optional().or(z.literal("")),
  membership_start: z.string().optional().or(z.literal("")),
  membership_end: z.string().optional().or(z.literal("")),
  amount_paid: z.number().min(0, "Amount cannot be negative").optional().default(0),
});

export type MemberFormValues = z.infer<typeof memberFormSchema>;
