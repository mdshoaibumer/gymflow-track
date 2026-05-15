import { describe, it, expect } from "vitest";
import { z } from "zod";

// Replicate the login schema from login/page.tsx
const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

// Replicate the register schema from register/page.tsx
const registerSchema = z.object({
  gym_name: z.string().min(2, "Gym name must be at least 2 characters"),
  owner_name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/\d/, "Must contain at least one digit"),
  city: z.string().optional(),
});

describe("Login Schema Validation", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({
      email: "owner@gym.com",
      password: "MyPassword1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty email", () => {
    const result = loginSchema.safeParse({ email: "", password: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = loginSchema.safeParse({ email: "notanemail", password: "test" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Enter a valid email");
    }
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Password is required");
    }
  });
});

describe("Register Schema Validation", () => {
  const validData = {
    gym_name: "FitZone Gym",
    owner_name: "Rahul",
    phone: "9876543210",
    email: "rahul@fitzone.in",
    password: "StrongPass1",
  };

  it("accepts valid registration data", () => {
    const result = registerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("accepts optional city field", () => {
    const result = registerSchema.safeParse({ ...validData, city: "Mumbai" });
    expect(result.success).toBe(true);
  });

  describe("gym_name validation", () => {
    it("rejects gym name shorter than 2 characters", () => {
      const result = registerSchema.safeParse({ ...validData, gym_name: "A" });
      expect(result.success).toBe(false);
    });
  });

  describe("phone validation (Indian mobile)", () => {
    it("rejects phone numbers not starting with 6-9", () => {
      const result = registerSchema.safeParse({ ...validData, phone: "5123456789" });
      expect(result.success).toBe(false);
    });

    it("rejects phone numbers with less than 10 digits", () => {
      const result = registerSchema.safeParse({ ...validData, phone: "987654321" });
      expect(result.success).toBe(false);
    });

    it("rejects phone numbers with more than 10 digits", () => {
      const result = registerSchema.safeParse({ ...validData, phone: "98765432100" });
      expect(result.success).toBe(false);
    });

    it("accepts valid numbers starting with 6, 7, 8, 9", () => {
      expect(registerSchema.safeParse({ ...validData, phone: "6123456789" }).success).toBe(true);
      expect(registerSchema.safeParse({ ...validData, phone: "7123456789" }).success).toBe(true);
      expect(registerSchema.safeParse({ ...validData, phone: "8123456789" }).success).toBe(true);
      expect(registerSchema.safeParse({ ...validData, phone: "9123456789" }).success).toBe(true);
    });

    it("rejects phone with letters", () => {
      const result = registerSchema.safeParse({ ...validData, phone: "98765abcde" });
      expect(result.success).toBe(false);
    });
  });

  describe("password validation (NIST-compliant)", () => {
    it("rejects password shorter than 8 characters", () => {
      const result = registerSchema.safeParse({ ...validData, password: "Pass1" });
      expect(result.success).toBe(false);
    });

    it("rejects password without uppercase letter", () => {
      const result = registerSchema.safeParse({ ...validData, password: "alllower1" });
      expect(result.success).toBe(false);
    });

    it("rejects password without lowercase letter", () => {
      const result = registerSchema.safeParse({ ...validData, password: "ALLUPPER1" });
      expect(result.success).toBe(false);
    });

    it("rejects password without digit", () => {
      const result = registerSchema.safeParse({ ...validData, password: "NoDigitsHere" });
      expect(result.success).toBe(false);
    });

    it("accepts password meeting all requirements", () => {
      const result = registerSchema.safeParse({ ...validData, password: "ValidPass1" });
      expect(result.success).toBe(true);
    });

    it("accepts long passwords (128 chars)", () => {
      const longPass = "A" + "a".repeat(125) + "1x";
      const result = registerSchema.safeParse({ ...validData, password: longPass });
      expect(result.success).toBe(true);
    });
  });

  describe("email validation", () => {
    it("rejects email without @", () => {
      const result = registerSchema.safeParse({ ...validData, email: "notvalid" });
      expect(result.success).toBe(false);
    });

    it("rejects email without domain", () => {
      const result = registerSchema.safeParse({ ...validData, email: "user@" });
      expect(result.success).toBe(false);
    });

    it("accepts valid email formats", () => {
      expect(registerSchema.safeParse({ ...validData, email: "user@domain.co.in" }).success).toBe(true);
      expect(registerSchema.safeParse({ ...validData, email: "user+tag@gmail.com" }).success).toBe(true);
    });
  });
});
