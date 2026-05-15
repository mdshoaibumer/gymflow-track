import { describe, it, expect } from "vitest";
import { formatPaise, cn } from "@/lib/utils";

describe("formatPaise", () => {
  it("converts paise to rupee string", () => {
    expect(formatPaise(50000)).toBe("₹500");
  });

  it("handles zero", () => {
    expect(formatPaise(0)).toBe("₹0");
  });

  it("handles small amounts (less than 1 rupee)", () => {
    expect(formatPaise(50)).toBe("₹0.5");
  });

  it("handles large amounts with Indian locale grouping", () => {
    // Indian locale uses lakh/crore grouping: 1,00,000
    const result = formatPaise(10000000); // ₹1,00,000
    expect(result).toContain("₹");
    expect(result).toContain("1,00,000");
  });

  it("handles decimal paise amounts correctly", () => {
    expect(formatPaise(999)).toBe("₹9.99");
  });

  it("handles negative amounts", () => {
    const result = formatPaise(-5000);
    expect(result).toContain("-");
    expect(result).toContain("50");
  });

  it("returns consistent format for exact rupee amounts", () => {
    expect(formatPaise(100)).toBe("₹1");
    expect(formatPaise(1000)).toBe("₹10");
    expect(formatPaise(10000)).toBe("₹100");
  });
});

describe("cn (className merge utility)", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("merges tailwind classes correctly (last wins)", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("handles undefined and null", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });
});
