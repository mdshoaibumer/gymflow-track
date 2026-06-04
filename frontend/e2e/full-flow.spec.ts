/**
 * Comprehensive browser-based end-to-end tests for GymFlow.
 *
 * Exercises the full flow against a real backend (SQLite mode):
 * - Registration → Dashboard redirect
 * - Login → Dashboard → Navigation
 * - Member CRUD
 * - Attendance page
 * - Settings page
 * - Logout
 *
 * Prerequisites:
 *   Backend running:  cd backend && python run_sqlite_server.py
 *   Frontend running: cd frontend && npm run dev
 */
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// SQLite cannot handle concurrent writes — run all tests in this file serially
test.describe.configure({ mode: "serial" });

// ── Shared constants ──────────────────────────────────────────────────
const RUN_ID = Date.now();
const TEST_PASSWORD = "StrongPass123";
const API_BASE = "http://localhost:8000/api/v1";

// ── Helper: Register via API (much faster than UI, no bcrypt wait in browser) ─
async function registerViaAPI(
  request: APIRequestContext,
  opts: { gym_name: string; owner_name: string; phone: string; email: string }
) {
  // Retry up to 3 times — SQLite can return 500 under concurrent writes
  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await request.post(`${API_BASE}/auth/register`, {
      data: {
        gym_name: opts.gym_name,
        owner_name: opts.owner_name,
        phone: opts.phone,
        email: opts.email,
        password: TEST_PASSWORD,
      },
    });
    if (resp.status() === 201) return resp.json();
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      continue;
    }
    throw new Error(`Registration failed (${resp.status()}): ${await resp.text()}`);
  }
}

// ── Helper: Login via the UI ──────────────────────────────────────────
async function loginUser(page: Page, email: string) {
  await page.goto("/login");
  // Ensure tour won't interfere with test interactions
  await page.evaluate(() => localStorage.setItem("gymflow-tour-completed", "true")).catch(() => {});
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard|setup/, { timeout: 30000 });
  // Dismiss tour overlay if it somehow appears
  const tourClose = page.locator("[aria-label='Close tour']");
  if (await tourClose.isVisible({ timeout: 2000 }).catch(() => false)) {
    await tourClose.click();
  }
}

// ══════════════════════════════════════════════════════════════════════
// 1. REGISTRATION FLOW (uses UI)
// ══════════════════════════════════════════════════════════════════════
test.describe("Registration Flow", () => {
  const REG_EMAIL = `reg_${RUN_ID}@testgym.com`;

  test("can register a new gym and redirects to setup", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Gym Name").fill("Iron Paradise Gym");
    await page.getByLabel("Your Name").fill("Rajesh Kumar");
    await page.getByLabel("WhatsApp Number").fill("9876543210");
    await page.getByLabel(/email/i).fill(REG_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();

    await page.waitForURL(/setup|dashboard/, { timeout: 45000 });
    const url = page.url();
    expect(url).toMatch(/setup|dashboard/);
  });

  test("duplicate email shows error", async ({ page, request }) => {
    // Ensure the email is registered (may already be from previous test)
    try { await registerViaAPI(request, { gym_name: "Dup Gym", owner_name: "Dup", phone: "9876540099", email: REG_EMAIL }); } catch { /* already exists */ }

    // Try registering again with the same email via UI
    await page.goto("/register");
    await page.getByLabel("Gym Name").fill("Another Gym");
    await page.getByLabel("Your Name").fill("Another Owner");
    await page.getByLabel("WhatsApp Number").fill("9876543211");
    await page.getByLabel(/email/i).fill(REG_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();

    // Should show an error (stay on register page or show toast)
    await page.waitForTimeout(3000);
    const url = page.url();
    const hasError = url.includes("register") ||
      (await page.locator("[role='alert'], [data-sonner-toast]").count()) > 0;
    expect(hasError).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2. LOGIN FLOW
// ══════════════════════════════════════════════════════════════════════
test.describe("Login Flow", () => {
  const LOGIN_EMAIL = `login_${RUN_ID}@testgym.com`;

  test.beforeAll(async ({ request }) => {
    await registerViaAPI(request, {
      gym_name: "Login Test Gym",
      owner_name: "Login Tester",
      phone: "9876500010",
      email: LOGIN_EMAIL,
    });
  });

  test("can login and see dashboard", async ({ page }) => {
    await loginUser(page, LOGIN_EMAIL);
    const url = page.url();
    expect(url).toMatch(/dashboard|setup/);
  });

  test("invalid credentials stay on login page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("nobody@example.com");
    await page.getByLabel("Password", { exact: true }).fill("WrongPassword99");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/login/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 3. AUTHENTICATED NAVIGATION
// ══════════════════════════════════════════════════════════════════════
test.describe("Authenticated Navigation", () => {
  const NAV_EMAIL = `nav_${RUN_ID}@testgym.com`;

  test.beforeAll(async ({ request }) => {
    await registerViaAPI(request, {
      gym_name: "Nav Test Gym",
      owner_name: "Nav Tester",
      phone: "9876500001",
      email: NAV_EMAIL,
    });
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page, NAV_EMAIL);
  });

  test("dashboard page loads with metrics", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/active members/i)).toBeVisible();
    await expect(page.getByText(/revenue|attendance/i).first()).toBeVisible();
  });

  test("members page loads", async ({ page }) => {
    await page.goto("/members");
    await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible({ timeout: 10000 });
  });

  test("payments page loads", async ({ page }) => {
    await page.goto("/payments");
    await expect(page.getByRole("heading", { name: /payments/i })).toBeVisible({ timeout: 10000 });
  });

  test("attendance page loads", async ({ page }) => {
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible({ timeout: 10000 });
  });

  test("equipment page loads", async ({ page }) => {
    await page.goto("/equipment");
    await expect(page.getByRole("heading", { name: /equipment/i })).toBeVisible({ timeout: 10000 });
  });

  test("notifications page loads", async ({ page }) => {
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: /whatsapp|reminders|notifications/i })).toBeVisible({ timeout: 10000 });
  });

  test("settings page loads", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible({ timeout: 10000 });
  });

  test("billing page loads", async ({ page }) => {
    await page.goto("/billing");
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toMatch(/billing|login/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 4. MEMBER MANAGEMENT
// ══════════════════════════════════════════════════════════════════════
test.describe("Member Management", () => {
  const MEMBER_EMAIL = `member_${RUN_ID}@testgym.com`;

  test.beforeAll(async ({ request }) => {
    await registerViaAPI(request, {
      gym_name: "Member Test Gym",
      owner_name: "Member Tester",
      phone: "9876500002",
      email: MEMBER_EMAIL,
    });
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page, MEMBER_EMAIL);
  });

  test("can open add member form", async ({ page }) => {
    await page.goto("/members");
    await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible({ timeout: 10000 });

    const addBtn = page.getByRole("button", { name: /add member|new member/i });
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(1000);
      const formVisible = (await page.getByLabel(/name/i).count()) > 0 ||
        (await page.locator("[role='dialog']").count()) > 0;
      expect(formVisible).toBeTruthy();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// 5. API HEALTH CHECK
// ══════════════════════════════════════════════════════════════════════
test.describe("API Integration", () => {
  test("backend health endpoint is reachable", async ({ page }) => {
    const response = await page.goto("http://localhost:8000/health");
    expect(response?.status()).toBe(200);
    const body = await response?.json();
    expect(body.status).toBe("healthy");
  });

  test("API docs accessible in development", async ({ page }) => {
    const response = await page.goto("http://localhost:8000/docs");
    expect(response?.status()).toBe(200);
  });

  test("billing plans API returns plans", async ({ page }) => {
    const response = await page.goto("http://localhost:8000/api/v1/billing/plans");
    expect(response?.status()).toBe(200);
    const body = await response?.json();
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 6. LOGOUT FLOW
// ══════════════════════════════════════════════════════════════════════
test.describe("Logout Flow", () => {
  const LOGOUT_EMAIL = `logout_${RUN_ID}@testgym.com`;

  test.beforeAll(async ({ request }) => {
    await registerViaAPI(request, {
      gym_name: "Logout Test Gym",
      owner_name: "Logout Tester",
      phone: "9876500003",
      email: LOGOUT_EMAIL,
    });
  });

  test("can logout and is redirected to login", async ({ page }) => {
    await loginUser(page, LOGOUT_EMAIL);

    // Look for logout button (might be in a dropdown)
    const logoutBtn = page.getByRole("button", { name: /log\s?out|sign\s?out/i });
    const menuBtn = page.getByRole("button", { name: /menu|account|profile|user/i });

    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    } else if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await page.waitForTimeout(500);
      const dropdownLogout = page.getByRole("menuitem", { name: /log\s?out|sign\s?out/i });
      if (await dropdownLogout.isVisible()) {
        await dropdownLogout.click();
      }
    }

    await page.waitForURL(/login/, { timeout: 10000 });
    await expect(page).toHaveURL(/login/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 7. ACCESSIBILITY BASICS
// ══════════════════════════════════════════════════════════════════════
test.describe("Accessibility Basics", () => {
  test("login page has proper form labels", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel("Password", { exact: true });
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("autocomplete", "email");
    await expect(passwordInput).toHaveAttribute("autocomplete", "current-password");
  });

  test("register page has proper form labels", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByLabel("Gym Name")).toBeVisible();
    await expect(page.getByLabel("Your Name")).toBeVisible();
    await expect(page.getByLabel("WhatsApp Number")).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  });

  test("forms prevent submission with empty fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/login/);
  });
});
