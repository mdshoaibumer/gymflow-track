import { z } from "zod";

export const paymentFormSchema = z.object({
  member_id: z.string().min(1, "Select a member"),
  amount: z
    .number({ message: "Enter a valid amount" })
    .positive("Amount must be greater than 0"),
  discount: z
    .number()
    .min(0, "Discount cannot be negative")
    .optional()
    .default(0),
  payment_method: z.enum(["cash", "upi", "card", "bank_transfer", "other"], {
    message: "Select a payment method",
  }),
  payment_status: z.enum(["completed", "pending"]).default("completed"),
  payment_date: z.string().optional(),
  notes: z.string().max(500).optional(),
  // Optional membership renewal
  membership_plan: z.string().optional(),
  membership_start: z.string().optional(),
  membership_end: z.string().optional(),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;
