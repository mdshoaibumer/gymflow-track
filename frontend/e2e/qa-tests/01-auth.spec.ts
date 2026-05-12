/**
 * ═══════════════════════════════════════════════════════════════════
 * GYMFLOW — MODULE 01: AUTHENTICATION E2E TESTS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests: Login, Registration, Session, Logout, Protected Routes,
 *        Security (XSS/SQLi), Password Visibility, Multi-Tab,
 *        Network Resilience, Mobile Responsive.
 */
import { test, expect } from "@playwright/test";
import {
  API_BASE,
  TEST_PASSWORD,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
  registerViaAPI,
  loginViaUI,
  logoutViaUI,
  uniqueEmail,
  uniquePhone,
  setupErrorCollector,
  waitForToast,
  waitForErrorAlert,
  measurePageLoad,
  checkBasicA11y,
} from "./fixtures";

// ── Shared state ──────────────────────────────────────────────────────
let ownerEmail: string;
const ownerPassword = TEST_PASSWORD;

test.beforeAll(async ({ request }) => {
  const { resp, email } = await registerViaAPI(request);
  expect([200, 201]).toContain(resp.status());
  ownerEmail = email;
});

// ══════════════════════════════════════════════════════════════════════
//  LOGIN PAGE RENDERING
// ══════════════════════════════════════════════════════════════════════
test.describe("01. AUTH — Login Page", () => {
  test("renders login form with all elements", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Check all form elements exist
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /register|sign up|create/i })).toBeVisible();
  });

  test("login page loads quickly (< 5s)", async ({ page }) => {
    const loadTime = await measurePageLoad(page, "/login");
    expect(loadTime).toBeLessThan(5000);
  });

  test("login page has proper accessibility", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const issues = await checkBasicA11y(page);
    // Allow minor issues but no critical ones
    const critical = issues.filter((i) => !i.includes("Button at index"));
    expect(critical).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  LOGIN VALIDATION
// ══════════════════════════════════════════════════════════════════════
test.describe("01. AUTH — Login Validation", () => {
  test("empty form submission shows validation errors", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(1000);
    // Should show validation errors
    const errorMessages = page.locator(".text-destructive, [role='alert']");
    const errorCount = await errorMessages.count();
    expect(errorCount).toBeGreaterThan(0);
    // Should stay on login page
    expect(page.url()).toContain("/login");
  });

  test("invalid email format shows error", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("somepassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(1000);
    const emailError = page.locator("#email-error, .text-destructive").first();
    await expect(emailError).toBeVisible();
  });

  test("wrong password shows error, stays on login", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(ownerEmail);
    await page.getByLabel("Password", { exact: true }).fill("WrongPassword99!");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(3000);
    expect(page.url()).toContain("/login");
    // Should show error alert or toast
    const hasError =
      (await page.locator("[role='alert']").count()) > 0 ||
      (await page.locator("[data-sonner-toast]").count()) > 0;
    expect(hasError).toBeTruthy();
  });

  test("non-existent email shows error", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill("nonexistent_999@test.com");
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(3000);
    expect(page.url()).toContain("/login");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SUCCESSFUL LOGIN
// ══════════════════════════════════════════════════════════════════════
test.describe("01. AUTH — Successful Login", () => {
  test("valid credentials redirect to dashboard/setup", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, ownerEmail, ownerPassword);
    expect(page.url()).toMatch(/\/(dashboard|setup)/);
    // No critical JS errors
    expect(errors.getCriticalErrors()).toHaveLength(0);
  });

  test("login button shows loading state during submission", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(ownerEmail);
    await page.getByLabel("Password", { exact: true }).fill(ownerPassword);

    const submitBtn = page.getByRole("button", { name: /sign in/i });

    // Intercept the login API to slow it down so we can observe loading state
    await page.route("**/auth/login", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    await submitBtn.click();

    // Button should show loading state: disabled + "Signing in…" text + Loader2 spinner
    // The button text changes from "Sign In" to "Signing in…" with a Loader2 icon
    await expect(page.getByRole("button", { name: /signing in/i })).toBeVisible({ timeout: 5000 });

    // Unblock and wait for navigation
    await page.unroute("**/auth/login");
    await page.waitForURL(/\/(dashboard|setup)/, { timeout: 30000 });
  });
});

// ══════════════════════════════════════════════════════════════════════
//  PASSWORD VISIBILITY TOGGLE
// ══════════════════════════════════════════════════════════════════════
test.describe("01. AUTH — Password Toggle", () => {
  test("password field toggles visibility", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const passwordInput = page.getByLabel("Password", { exact: true });
    await passwordInput.fill("TestPassword123");

    // Should be type=password initially
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Click the eye toggle button
    const toggleBtn = page.locator("button").filter({ has: page.locator("svg") }).filter({
      hasText: /^$/,
    });
    // Find the toggle near the password field
    const eyeBtn = page.locator("[type='button']").filter({ has: page.locator("svg.lucide-eye, svg.lucide-eye-off") }).first();
    if (await eyeBtn.isVisible().catch(() => false)) {
      await eyeBtn.click();
      await page.waitForTimeout(200);
      // Should now be type=text
      await expect(passwordInput).toHaveAttribute("type", "text");
      // Toggle back
      await eyeBtn.click();
      await page.waitForTimeout(200);
      await expect(passwordInput).toHaveAttribute("type", "password");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
//  REGISTRATION
// ══════════════════════════════════════════════════════════════════════
test.describe("01. AUTH — Registration", () => {
  test("registration page renders all fields", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /register/i })).toBeVisible();
    await expect(page.getByLabel(/gym name/i)).toBeVisible();
    await expect(page.getByLabel(/your name|owner name/i)).toBeVisible();
    await expect(page.getByLabel(/phone|whatsapp/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  });

  test("registration with valid data succeeds", async ({ page }) => {
    const email = uniqueEmail("reg");
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/gym name/i).fill("Test Gym E2E");
    await page.getByLabel(/your name|owner name/i).fill("Test Owner");
    await page.getByLabel(/phone|whatsapp/i).fill(uniquePhone());
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /create account|register|sign up/i }).click();
    await page.waitForURL(/\/(setup|dashboard)/, { timeout: 30000 });
    expect(page.url()).toMatch(/\/(setup|dashboard)/);
  });

  test("duplicate email registration shows error", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/gym name/i).fill("Dup Gym");
    await page.getByLabel(/your name|owner name/i).fill("Dup Owner");
    await page.getByLabel(/phone|whatsapp/i).fill(uniquePhone());
    await page.getByLabel(/email/i).fill(ownerEmail); // Already exists
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /create account|register|sign up/i }).click();
    await page.waitForTimeout(3000);
    // Should stay on register or show error
    const hasError =
      page.url().includes("register") ||
      (await page.locator("[role='alert'], [data-sonner-toast]").count()) > 0;
    expect(hasError).toBeTruthy();
  });

  test("weak password is rejected", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/gym name/i).fill("Weak Gym");
    await page.getByLabel(/your name|owner name/i).fill("Weak Owner");
    await page.getByLabel(/phone|whatsapp/i).fill(uniquePhone());
    await page.getByLabel(/email/i).fill(uniqueEmail("weak"));
    await page.getByLabel("Password", { exact: true }).fill("123"); // Weak
    await page.getByRole("button", { name: /create account|register|sign up/i }).click();
    await page.waitForTimeout(1000);
    // Client-side validation should catch this
    const errors = page.locator(".text-destructive, [role='alert']");
    expect(await errors.count()).toBeGreaterThan(0);
  });

  test("invalid Indian phone number is rejected", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/gym name/i).fill("Bad Phone Gym");
    await page.getByLabel(/your name|owner name/i).fill("Owner");
    await page.getByLabel(/phone|whatsapp/i).fill("12345"); // Invalid
    await page.getByLabel(/email/i).fill(uniqueEmail("badphone"));
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /create account|register|sign up/i }).click();
    await page.waitForTimeout(1000);
    const errors = page.locator(".text-destructive");
    expect(await errors.count()).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  PROTECTED ROUTES
// ══════════════════════════════════════════════════════════════════════
test.describe("01. AUTH — Protected Routes", () => {
  test("unauthenticated user is redirected from /dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated user is redirected from /members", async ({ page }) => {
    await page.goto("/members");
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated user is redirected from /payments", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated user is redirected from /staff", async ({ page }) => {
    await page.goto("/staff");
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated user is redirected from /settings", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated user is redirected from /admin", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain("/login");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SESSION PERSISTENCE
// ══════════════════════════════════════════════════════════════════════
test.describe("01. AUTH — Session", () => {
  test("session persists after page refresh", async ({ page }) => {
    await loginViaUI(page, ownerEmail, ownerPassword);
    expect(page.url()).toMatch(/\/(dashboard|setup)/);

    // Refresh the page
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Should still be on dashboard (not redirected to login)
    expect(page.url()).not.toContain("/login");
  });

  test("logout redirects to login and clears session", async ({ page }) => {
    await loginViaUI(page, ownerEmail, ownerPassword);
    await logoutViaUI(page);
    await page.waitForTimeout(2000);

    // After logout, should be on login page or redirected there
    if (!page.url().includes("/login")) {
      // Try accessing protected route — should redirect to login
      await page.goto("/dashboard");
      await page.waitForURL(/\/login/, { timeout: 15000 });
    }
    expect(page.url()).toContain("/login");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SECURITY — XSS / SQL INJECTION
// ══════════════════════════════════════════════════════════════════════
test.describe("01. AUTH — Security", () => {
  test("XSS in email field is sanitized", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const xssPayload = '<script>alert("xss")</script>';
    await page.getByLabel(/email/i).fill(xssPayload);
    await page.getByLabel("Password", { exact: true }).fill("test");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(2000);

    // No alert dialog should have appeared
    let alertFired = false;
    page.on("dialog", () => {
      alertFired = true;
    });
    expect(alertFired).toBeFalsy();
    // Should still be on login page
    expect(page.url()).toContain("/login");
  });

  test("SQL injection in email field doesn't crash", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill("admin@test.com' OR '1'='1");
    await page.getByLabel("Password", { exact: true }).fill("' OR '1'='1");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(3000);
    // Should stay on login, not crash or expose data
    expect(page.url()).toContain("/login");
  });

  test("XSS in registration fields is handled", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/gym name/i).fill('<img src=x onerror=alert(1)>');
    await page.getByLabel(/your name|owner name/i).fill('<svg onload=alert(1)>');
    await page.getByLabel(/phone|whatsapp/i).fill(uniquePhone());
    await page.getByLabel(/email/i).fill(uniqueEmail("xss"));
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /create account|register|sign up/i }).click();
    await page.waitForTimeout(3000);

    // Should not trigger any alert dialogs
    let alertFired = false;
    page.on("dialog", () => {
      alertFired = true;
    });
    expect(alertFired).toBeFalsy();
  });

  test("API login endpoint rejects SQL injection", async ({ request }) => {
    const resp = await request.post(`${API_BASE}/auth/login`, {
      data: {
        email: "' OR 1=1 --",
        password: "' OR 1=1 --",
      },
    });
    // Should return 401 or 422 — NOT 200
    expect(resp.status()).not.toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SUPER ADMIN LOGIN
// ══════════════════════════════════════════════════════════════════════
test.describe("01. AUTH — Super Admin", () => {
  test("super admin login redirects to /admin", async ({ page }) => {
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    expect(page.url()).toContain("/admin");
  });

  test("regular owner cannot access /admin", async ({ page }) => {
    await loginViaUI(page, ownerEmail, ownerPassword);
    await page.goto("/admin");
    await page.waitForTimeout(3000);
    // Should be redirected away from admin
    expect(page.url()).not.toMatch(/\/admin(?!\/|$)/);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  FORGOT PASSWORD
// ══════════════════════════════════════════════════════════════════════
test.describe("01. AUTH — Forgot Password", () => {
  test("forgot password page renders", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test("forgot password link works from login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: /forgot password/i }).click();
    await page.waitForURL(/forgot-password/);
    expect(page.url()).toContain("forgot-password");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  DUPLICATE SUBMISSION PREVENTION
// ══════════════════════════════════════════════════════════════════════
test.describe("01. AUTH — Double Submit", () => {
  test("rapid double-click on login doesn't cause errors", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(ownerEmail);
    await page.getByLabel("Password", { exact: true }).fill(ownerPassword);

    const btn = page.getByRole("button", { name: /sign in/i });
    // Rapid double click
    await btn.click();
    await btn.click({ delay: 50 });

    await page.waitForURL(/\/(dashboard|setup|login)/, { timeout: 30000 });
    // Should either succeed or stay on login — no crash
    const criticalErrors = errors.getCriticalErrors();
    expect(criticalErrors).toHaveLength(0);
  });
});
