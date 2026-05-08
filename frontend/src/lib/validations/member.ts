import { z } from "zod";

/**
 * Zod schema for member form validation.
 * Mirrors backend Pydantic MemberCreateRequest exactly.
 *
 * Phone pattern: Indian mobile (starts with 6-9, 10 digits)
 */
export const memberFormSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(200, "Name is too long"),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  email: z.union([z.literal(""), z.string().email("Enter a valid email")]).optional(),
  gender: z.enum(["male", "female", "other", ""]).optional(),
  membership_plan: z.string().max(100).optional().or(z.literal("")),
  membership_start: z.string().optional().or(z.literal("")),
  membership_end: z.string().optional().or(z.literal("")),
  amount_paid: z.number().min(0, "Amount cannot be negative").optional().default(0),
});

export type MemberFormValues = z.infer<typeof memberFormSchema>;
