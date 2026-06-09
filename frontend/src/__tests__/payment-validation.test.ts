import { describe, it, expect } from "vitest";
import { paymentFormSchema } from "@/lib/validations/payment";

const validBase = {
  member_id: "some-uuid",
  amount: 3000,
  payment_method: "cash" as const,
  payment_status: "completed" as const,
};

describe("Payment Form Schema — Pay Later (₹0 Pending)", () => {
  it("accepts ₹0 amount when status is pending", () => {
    const result = paymentFormSchema.safeParse({
      ...validBase,
      amount: 0,
      payment_status: "pending",
    });
    expect(result.success).toBe(true);
  });

  it("rejects ₹0 amount when status is completed", () => {
    const result = paymentFormSchema.safeParse({
      ...validBase,
      amount: 0,
      payment_status: "completed",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const amountError = result.error.issues.find((i) => i.path.includes("amount"));
      expect(amountError).toBeDefined();
      expect(amountError?.message).toContain("greater than 0");
    }
  });

  it("rejects negative amount for any status", () => {
    const resultCompleted = paymentFormSchema.safeParse({
      ...validBase,
      amount: -100,
      payment_status: "completed",
    });
    expect(resultCompleted.success).toBe(false);

    const resultPending = paymentFormSchema.safeParse({
      ...validBase,
      amount: -100,
      payment_status: "pending",
    });
    expect(resultPending.success).toBe(false);
  });

  it("accepts positive amount for completed", () => {
    const result = paymentFormSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("accepts positive amount for pending (advance/partial)", () => {
    const result = paymentFormSchema.safeParse({
      ...validBase,
      amount: 1000,
      payment_status: "pending",
    });
    expect(result.success).toBe(true);
  });

  it("defaults payment_status to completed when not provided", () => {
    const result = paymentFormSchema.safeParse({
      member_id: "some-uuid",
      amount: 3000,
      payment_method: "cash",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payment_status).toBe("completed");
    }
  });

  it("includes optional membership fields in valid pay-later payload", () => {
    const result = paymentFormSchema.safeParse({
      member_id: "some-uuid",
      amount: 0,
      payment_method: "cash",
      payment_status: "pending",
      membership_plan: "Monthly",
      membership_start: "2026-06-09",
      membership_end: "2026-07-09",
      notes: "Will pay after 8 days",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.membership_plan).toBe("Monthly");
      expect(result.data.notes).toBe("Will pay after 8 days");
    }
  });
});
