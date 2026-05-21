import { describe, it, expect } from "vitest";
import { memberFormSchema, normalizePhone } from "@/lib/validations/member";
import { calculateEndDate } from "@/lib/membership-plans";

describe("Member Form Schema — Membership Fields", () => {
  const validBase = {
    name: "Amit Sharma",
    phone: "9876543210",
    email: "",
    gender: "male",
    father_name: "",
    batch: "morning",
  };

  it("accepts form with membership fields", () => {
    const result = memberFormSchema.safeParse({
      ...validBase,
      membership_plan: "Monthly",
      membership_start: "2025-01-01",
      membership_end: "2025-02-01",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.membership_plan).toBe("Monthly");
      expect(result.data.membership_start).toBe("2025-01-01");
      expect(result.data.membership_end).toBe("2025-02-01");
    }
  });

  it("accepts form without membership fields (for create)", () => {
    const result = memberFormSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("accepts empty string for membership fields", () => {
    const result = memberFormSchema.safeParse({
      ...validBase,
      membership_plan: "",
      membership_start: "",
      membership_end: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects membership_plan longer than 100 chars", () => {
    const result = memberFormSchema.safeParse({
      ...validBase,
      membership_plan: "A".repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

describe("calculateEndDate", () => {
  it("adds 1 month correctly", () => {
    expect(calculateEndDate("2025-01-15", 1)).toBe("2025-02-15");
  });

  it("adds 3 months for quarterly plan", () => {
    expect(calculateEndDate("2025-01-01", 3)).toBe("2025-04-01");
  });

  it("adds 12 months for annual plan", () => {
    expect(calculateEndDate("2025-01-01", 12)).toBe("2026-01-01");
  });

  it("handles month overflow (Jan 31 + 1 month)", () => {
    // JS Date rolls over to Mar 3 for "Jan 31 + 1 month" (Feb only has 28 days)
    const result = calculateEndDate("2025-01-31", 1);
    // Expect March 3 due to JS Date behavior (28 + 3 = 31)
    expect(result).toBe("2025-03-03");
  });
});

describe("Phone normalization for imported members", () => {
  it("normalizes +91 prefix", () => {
    expect(normalizePhone("+91 9876543210")).toBe("9876543210");
  });

  it("normalizes 0-prefix", () => {
    expect(normalizePhone("09876543210")).toBe("9876543210");
  });

  it("passes through clean 10-digit number", () => {
    expect(normalizePhone("9876543210")).toBe("9876543210");
  });

  it("strips dashes and spaces", () => {
    expect(normalizePhone("98765-43210")).toBe("9876543210");
  });
});
