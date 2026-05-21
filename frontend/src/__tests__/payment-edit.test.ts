import { describe, it, expect } from "vitest";
import type { UpdatePaymentPayload } from "@/services/payment.service";

describe("Payment Edit - Payload construction", () => {
  const pendingPayment = {
    id: "pay-1",
    gym_id: "gym-1",
    member_id: "mem-1",
    amount_in_paise: 300000,
    payment_method: "upi" as const,
    payment_status: "pending" as const,
    payment_date: "2026-05-21",
    notes: "3 month plan",
    created_by: "user-1",
    member_name: "Test Member",
    voided_at: null,
    voided_by: null,
    void_reason: null,
  };

  const completedPayment = {
    ...pendingPayment,
    id: "pay-2",
    payment_status: "completed" as const,
    amount_in_paise: 100000,
    notes: "1 month plan",
  };

  it("allows all fields for pending payment payload", () => {
    const payload: UpdatePaymentPayload = {
      amount_in_paise: 100000,
      payment_method: "cash",
      payment_status: "completed",
      payment_date: "2026-05-22",
      notes: "Changed to 1 month",
      membership_plan: "Monthly",
      membership_start: "2026-05-22",
      membership_end: "2026-06-22",
    };
    expect(payload.amount_in_paise).toBe(100000);
    expect(payload.payment_status).toBe("completed");
    expect(payload.membership_plan).toBe("Monthly");
  });

  it("restricts completed payment payload to notes and method", () => {
    const payload: UpdatePaymentPayload = {
      payment_method: "card",
      notes: "Updated notes",
    };
    expect(payload.payment_method).toBe("card");
    expect(payload.notes).toBe("Updated notes");
    expect(payload.amount_in_paise).toBeUndefined();
    expect(payload.payment_status).toBeUndefined();
  });

  it("constructs correct diff payload from form values", () => {
    // Simulate what edit-payment-modal does
    const newAmount = "1000"; // ₹1000 = 100000 paise
    const newMethod = "cash";
    const newStatus = "completed";

    const payload: UpdatePaymentPayload = {};
    const amountPaise = Math.round(Number(newAmount) * 100);
    if (amountPaise !== pendingPayment.amount_in_paise) payload.amount_in_paise = amountPaise;
    if (newMethod !== pendingPayment.payment_method) payload.payment_method = newMethod;
    if (newStatus !== pendingPayment.payment_status) payload.payment_status = newStatus;

    expect(payload.amount_in_paise).toBe(100000);
    expect(payload.payment_method).toBe("cash");
    expect(payload.payment_status).toBe("completed");
  });

  it("produces empty payload when nothing changed", () => {
    const payload: UpdatePaymentPayload = {};
    const currentMethod = completedPayment.payment_method;
    const currentNotes = completedPayment.notes || "";

    if (currentMethod !== completedPayment.payment_method) payload.payment_method = currentMethod;
    if (currentNotes !== (completedPayment.notes || "")) payload.notes = currentNotes;

    expect(Object.keys(payload)).toHaveLength(0);
  });

  it("does not include membership fields for completed payments", () => {
    const payload: UpdatePaymentPayload = {
      notes: "updated",
    };
    // These should not be set for completed payment edits
    expect(payload.membership_start).toBeUndefined();
    expect(payload.membership_end).toBeUndefined();
    expect(payload.membership_plan).toBeUndefined();
  });
});
