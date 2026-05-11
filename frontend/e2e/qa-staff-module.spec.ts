/**
 * End-to-end tests for the Staff Management module.
 *
 * Prerequisites (run BEFORE the tests):
 *   1. Backend running:  cd backend && python run_sqlite_server.py
 *   2. Frontend running: cd frontend && npm run dev
 *   3. Pre-register the test owner in PowerShell:
 *        $body = @{gym_name="Staff E2E Gym";owner_name="Staff Test Owner";phone="9876500080";email="staff_e2e_owner@testgym.com";password="StrongPass123"} | ConvertTo-Json
 *        Invoke-WebRequest -Uri http://localhost:8000/api/v1/auth/register -Method Post -ContentType "application/json" -Body $body -UseBasicParsing
 */
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const RUN_ID = Date.now();
const TEST_PASSWORD = "StrongPass123";
const API_BASE = "http://localhost:8000/api/v1";

// Pre-registered owner (see prerequisites above)
const OWNER_EMAIL = "staff_e2e_owner@testgym.com";
const OWNER_NAME = "Staff Test Owner";

const NEW_STAFF_NAME = "Priya Sharma";
const NEW_STAFF_EMAIL = `priya_${RUN_ID}@testgym.com`;
const NEW_STAFF_PHONE = "9876501234";

// ── Helpers ───────────────────────────────────────────────────────────

async function loginViaUI(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto("/login");
  // Wait for React hydration — the form must be interactive
  await page.locator("#email").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard|setup/, { timeout: 30000 });
}

// ══════════════════════════════════════════════════════════════════════

test.describe("Staff Management", () => {
  test.describe("Owner Access", () => {
    test.beforeEach(async ({ page }) => {
      await loginViaUI(page, OWNER_EMAIL);
    });

    test("sidebar shows Staff link for owner", async ({ page }) => {
      const staffLink = page.locator("aside a", { hasText: "Staff" });
      await expect(staffLink).toBeVisible({ timeout: 10000 });
    });

    test("staff page loads with heading and controls", async ({ page }) => {
      await page.goto("/staff");
      await expect(
        page.getByRole("heading", { name: /staff management/i })
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByRole("button", { name: /add staff/i })
      ).toBeVisible();
      await expect(page.getByPlaceholder(/search/i)).toBeVisible();
    });

    test("owner user appears in the staff table", async ({ page }) => {
      await page.goto("/staff");
      await expect(
        page.getByRole("heading", { name: /staff management/i })
      ).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 10000 });
    });

    test("add staff dialog validates empty form", async ({ page }) => {
      await page.goto("/staff");
      await expect(
        page.getByRole("heading", { name: /staff management/i })
      ).toBeVisible({ timeout: 15000 });

      await page.getByRole("button", { name: /add staff/i }).click();
      await expect(
        page.getByRole("heading", { name: /add staff member/i })
      ).toBeVisible({ timeout: 5000 });

      // Submit empty form
      await page.getByRole("button", { name: /create user/i }).click();

      await expect(page.getByText(/name is required/i)).toBeVisible();
      await expect(page.getByText(/email is required/i)).toBeVisible();
      await expect(page.getByText(/phone is required/i)).toBeVisible();
      await expect(page.getByText(/password is required/i)).toBeVisible();
    });

    test("can create a new staff member", async ({ page }) => {
      await page.goto("/staff");
      await expect(
        page.getByRole("heading", { name: /staff management/i })
      ).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 10000 });

      await page.getByRole("button", { name: /add staff/i }).click();
      await expect(
        page.getByRole("heading", { name: /add staff member/i })
      ).toBeVisible({ timeout: 5000 });

      await page.locator("#staff-name").fill(NEW_STAFF_NAME);
      await page.locator("#staff-email").fill(NEW_STAFF_EMAIL);
      await page.locator("#staff-phone").fill(NEW_STAFF_PHONE);
      await page.locator("#staff-password").fill(TEST_PASSWORD);

      await page.getByRole("button", { name: /create user/i }).click();

      // Dialog closes on success
      await expect(
        page.getByRole("heading", { name: /add staff member/i })
      ).not.toBeVisible({ timeout: 15000 });

      // New user appears in table
      await expect(page.getByText(NEW_STAFF_NAME)).toBeVisible({
        timeout: 10000,
      });
    });

    test("search filter works", async ({ page }) => {
      await page.goto("/staff");
      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 15000 });

      await page.getByPlaceholder(/search/i).fill("Priya");
      await page.waitForTimeout(500);

      await expect(page.getByText(NEW_STAFF_NAME)).toBeVisible();
      await expect(page.getByText(OWNER_NAME)).not.toBeVisible();
    });

    test("search with no results shows empty state", async ({ page }) => {
      await page.goto("/staff");
      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 15000 });

      await page.getByPlaceholder(/search/i).fill("zzz_nonexistent_user");
      await page.waitForTimeout(500);

      await expect(page.getByText(/no results found/i)).toBeVisible({
        timeout: 5000,
      });
    });

    test("can edit a staff member name", async ({ page }) => {
      await page.goto("/staff");
      await expect(page.getByText(NEW_STAFF_NAME)).toBeVisible({
        timeout: 15000,
      });

      const staffRow = page.locator("tr", { hasText: NEW_STAFF_NAME });
      await staffRow.getByRole("button", { name: /edit/i }).click();

      await expect(
        page.getByRole("heading", { name: /edit user/i })
      ).toBeVisible({ timeout: 5000 });

      const nameInput = page.locator("#edit-name");
      await nameInput.clear();
      await nameInput.fill("Priya Sharma Updated");

      await page.getByRole("button", { name: /save changes/i }).click();

      await expect(
        page.getByRole("heading", { name: /edit user/i })
      ).not.toBeVisible({ timeout: 10000 });

      await expect(page.getByText("Priya Sharma Updated")).toBeVisible({
        timeout: 10000,
      });
    });

    test("can deactivate a staff member", async ({ page }) => {
      await page.goto("/staff");
      await expect(page.getByText("Priya Sharma Updated")).toBeVisible({
        timeout: 15000,
      });

      const staffRow = page.locator("tr", {
        hasText: "Priya Sharma Updated",
      });
      await staffRow.getByRole("button", { name: /deactivate/i }).click();

      await expect(staffRow.getByText(/inactive/i)).toBeVisible({
        timeout: 10000,
      });
    });

    test("status filter shows only inactive users", async ({ page }) => {
      await page.goto("/staff");
      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 15000 });

      await page.locator("[aria-label='Filter by status']").click();
      await page.getByRole("option", { name: /^Inactive$/i }).click();
      await page.waitForTimeout(300);

      await expect(page.getByText(OWNER_NAME)).not.toBeVisible();
      await expect(page.getByText("Priya Sharma Updated")).toBeVisible();
    });

    test("owner row has no edit or deactivate buttons", async ({ page }) => {
      await page.goto("/staff");
      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 15000 });

      const ownerRow = page.locator("tr", { hasText: OWNER_NAME });
      await expect(
        ownerRow.getByRole("button", { name: /edit/i })
      ).not.toBeVisible();
      await expect(
        ownerRow.getByRole("button", { name: /deactivate/i })
      ).not.toBeVisible();
    });

    test("role badges display correctly", async ({ page }) => {
      await page.goto("/staff");
      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 15000 });

      const tableBody = page.locator("tbody");
      await expect(
        tableBody.getByText("owner", { exact: true }).first()
      ).toBeVisible();
    });
  });

  test.describe("Non-Owner Access (RBAC)", () => {
    test("non-owner is redirected away from /staff", async ({ page }) => {
      // Login as owner first to create admin user
      await loginViaUI(page, OWNER_EMAIL);

      const adminEmail = `admin_rbac_${RUN_ID}@testgym.com`;
      const resp = await page.request.post(`${API_BASE}/users`, {
        data: {
          name: "Admin RBAC Test",
          email: adminEmail,
          phone: "9876505678",
          password: TEST_PASSWORD,
          role: "admin",
        },
      });

      if (resp.status() !== 201) {
        test.skip();
        return;
      }

      // Logout and login as admin
      await loginViaUI(page, adminEmail);

      // Navigate to /staff — should redirect to dashboard
      await page.goto("/staff");
      await page.waitForURL(/dashboard/, { timeout: 15000 });
      await expect(page).toHaveURL(/dashboard/);
    });

    test("sidebar does not show Staff link for non-owner", async ({
      page,
    }) => {
      // Login as owner first to create admin user
      await loginViaUI(page, OWNER_EMAIL);

      const adminEmail = `admin_sidebar_${RUN_ID}@testgym.com`;
      const resp = await page.request.post(`${API_BASE}/users`, {
        data: {
          name: "Admin Sidebar Test",
          email: adminEmail,
          phone: "9876506789",
          password: TEST_PASSWORD,
          role: "admin",
        },
      });

      if (resp.status() !== 201) {
        test.skip();
        return;
      }

      await loginViaUI(page, adminEmail);

      const staffLink = page.locator("aside a", { hasText: "Staff" });
      await page.waitForTimeout(2000);
      await expect(staffLink).not.toBeVisible();
    });
  });
});
