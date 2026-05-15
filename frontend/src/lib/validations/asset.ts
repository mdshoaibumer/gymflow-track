import { z } from "zod";

/**
 * Zod schema for equipment form validation.
 * Mirrors backend Pydantic AssetCreateRequest.
 */
export const assetFormSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(200, "Name is too long"),
  asset_code: z
    .string()
    .min(1, "Code is required")
    .max(50, "Code is too long"),
  category: z.enum(
    ["cardio", "strength", "free_weights", "functional", "accessories", "facility", "other"],
    { message: "Select a category" }
  ),
  manufacturer: z.string().max(200).optional().or(z.literal("")),
  serial_number: z.string().max(100).optional().or(z.literal("")),
  purchase_date: z.string().optional().or(z.literal("")),
  purchase_cost_in_paise: z.number().min(0, "Cost cannot be negative").nullish(),
  warranty_expiry: z.string().optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type AssetFormValues = z.infer<typeof assetFormSchema>;
