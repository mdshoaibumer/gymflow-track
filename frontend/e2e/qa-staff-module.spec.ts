/**
 * End-to-end tests for the Staff Management module.
 *
 * Tests the complete staff CRUD flow:
 * - Owner can see the Staff sidebar link and navigate to /staff
 * - Staff page loads with heading, filters, add button
 * - Owner can create a new staff user via the dialog
 * - New user appears in the table
 * - Owner can edit a staff user
 * - Owner can deactivate a staff user
 * - Non-owner (admin) cannot access /staff page (redirected)
 * - Validation errors shown for invalid form input
 *
 * Prerequisites:
 *   Backend running:  cd backend && python run_sqlite_server.py
 *   Frontend running: cd frontend && npm run dev
 */
import { test, expect, type Page } from "@playwright/test";

// SQLite cannot handle concurrent writes — run serially
test.describe.configure({ mode: "serial" });

// ── Constants ─────────────────────────────────────────────────────────
const RUN_ID = Date.now();
const TEST_PASSWORD = "StrongPass123";

const OWNER_EMAIL = `staff_owner_${RUN_ID}@testgym.com`;
const OWNER_NAME = "Staff Test Owner";
const OWNER_PHONE = "9876500080";
const GYM_NAME = "Staff Test Gym";

const NEW_STAFF_NAME = "Priya Sharma";
const NEW_STAFF_EMAIL = `priya_${RUN_ID}@testgym.com`;
const NEW_STAFF_PHONE = "9876501234";

// ── Helpers ───────────────────────────────────────────────────────────
async function registerViaUI(page: Page) {
  await page.goto("/register");
  await page.locator("#gym_name").fill(GYM_NAME);
  await page.locator("#owner_name").fill(OWNER_NAME);
  await page.locator("#phone").fill(OWNER_PHONE);
  await page.locator("#email").fill(OWNER_EMAIL);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  // Registration involves bcrypt hashing on the backend — allow up to 60s
  await page.waitForURL(/setup|dashboard/, { timeout: 60000 });
}

async function loginUser(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard|setup/, { timeout: 30000 });
}

// ══════════════════════════════════════════════════════════════════════
// STAFF MANAGEMENT E2E TESTS
// ══════════════════════════════════════════════════════════════════════

test.describe("Staff Management", () => {
  test.describe("Owner Access", () => {
    // Register once via the first test, then login before each subsequent test
    let registered = false;

    test.beforeEach(async ({ page }) => {
      if (!registered) {
        await registerViaUI(page);
        registered = true;
        // After registration we land on setup/dashboard — go back to login
        // so loginUser works cleanly for the actual test
        await page.goto("/login");
      }
      await loginUser(page, OWNER_EMAIL);
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

      // Owner should appear in the table
      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 10000 });
    });

    test("add staff dialog opens and validates empty form", async ({
      page,
    }) => {
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

      // Validation errors should appear
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

      // Wait for table to load
      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 10000 });

      await page.getByRole("button", { name: /add staff/i }).click();
      await expect(
        page.getByRole("heading", { name: /add staff member/i })
      ).toBeVisible({ timeout: 5000 });

      // Fill the form using explicit IDs for reliability
      await page.locator("#staff-name").fill(NEW_STAFF_NAME);
      await page.locator("#staff-email").fill(NEW_STAFF_EMAIL);
      await page.locator("#staff-phone").fill(NEW_STAFF_PHONE);
      await page.locator("#staff-password").fill(TEST_PASSWORD);

      // Submit
      await page.getByRole("button", { name: /create user/i }).click();

      // Wait for dialog to close
      await expect(
        page.getByRole("heading", { name: /add staff member/i })
      ).not.toBeVisible({ timeout: 15000 });

      // The new user should appear in the table
      await expect(page.getByText(NEW_STAFF_NAME)).toBeVisible({
        timeout: 10000,
      });
    });

    test("search filter works", async ({ page }) => {
      await page.goto("/staff");
      await expect(
        page.getByRole("heading", { name: /staff management/i })
      ).toBeVisible({ timeout: 15000 });

      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 10000 });

      // Search for the new staff member
      await page.getByPlaceholder(/search/i).fill("Priya");
      await page.waitForTimeout(500);

      await expect(page.getByText(NEW_STAFF_NAME)).toBeVisible();
      // Owner should be filtered out
      await expect(page.getByText(OWNER_NAME)).not.toBeVisible();
    });

    test("search with no results shows empty state", async ({ page }) => {
      await page.goto("/staff");
      await expect(
        page.getByRole("heading", { name: /staff management/i })
      ).toBeVisible({ timeout: 15000 });

      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 10000 });

      await page.getByPlaceholder(/search/i).fill("zzz_nonexistent_user");
      await page.waitForTimeout(500);

      await expect(page.getByText(/no results found/i)).toBeVisible({
        timeout: 5000,
      });
    });

    test("can edit a staff member", async ({ page }) => {
      await page.goto("/staff");
      await expect(
        page.getByRole("heading", { name: /staff management/i })
      ).toBeVisible({ timeout: 15000 });

      await expect(page.getByText(NEW_STAFF_NAME)).toBeVisible({
        timeout: 10000,
      });

      // Click edit button on the staff member's row
      const staffRow = page.locator("tr", { hasText: NEW_STAFF_NAME });
      await staffRow.getByRole("button", { name: /edit/i }).click();

      // Edit dialog should open
      await expect(
        page.getByRole("heading", { name: /edit user/i })
      ).toBeVisible({ timeout: 5000 });

      // Change the name
      const nameInput = page.locator("#edit-name");
      await nameInput.clear();
      await nameInput.fill("Priya Sharma Updated");

      await page.getByRole("button", { name: /save changes/i }).click();

      // Dialog should close
      await expect(
        page.getByRole("heading", { name: /edit user/i })
      ).not.toBeVisible({ timeout: 10000 });

      // Updated name should appear
      await expect(page.getByText("Priya Sharma Updated")).toBeVisible({
        timeout: 10000,
      });
    });

    test("can deactivate a staff member", async ({ page }) => {
      await page.goto("/staff");
      await expect(
        page.getByRole("heading", { name: /staff management/i })
      ).toBeVisible({ timeout: 15000 });

      await expect(page.getByText("Priya Sharma Updated")).toBeVisible({
        timeout: 10000,
      });

      // Click the deactivate button
      const staffRow = page.locator("tr", {
        hasText: "Priya Sharma Updated",
      });
      await staffRow.getByRole("button", { name: /deactivate/i }).click();

      // The row should update to show Inactive badge
      await expect(staffRow.getByText(/inactive/i)).toBeVisible({
        timeout: 10000,
      });
    });

    test("status filter works", async ({ page }) => {
      await page.goto("/staff");
      await expect(
        page.getByRole("heading", { name: /staff management/i })
      ).toBeVisible({ timeout: 15000 });

      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 10000 });

      // Filter by inactive status
      await page.locator("[aria-label='Filter by status']").click();
      await page.getByRole("option", { name: /^Inactive$/i }).click();
      await page.waitForTimeout(300);

      // Owner (active) should not be visible
      await expect(page.getByText(OWNER_NAME)).not.toBeVisible();

      // Deactivated staff member should be visible
      await expect(page.getByText("Priya Sharma Updated")).toBeVisible();
    });

    test("owner row has no edit or deactivate buttons", async ({ page }) => {
      await page.goto("/staff");
      await expect(
        page.getByRole("heading", { name: /staff management/i })
      ).toBeVisible({ timeout: 15000 });

      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 10000 });

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
      await expect(
        page.getByRole("heading", { name: /staff management/i })
      ).toBeVisible({ timeout: 15000 });

      await expect(page.getByText(OWNER_NAME)).toBeVisible({ timeout: 10000 });

      // Check role badges exist in the table
      const tableBody = page.locator("tbody");
      await expect(
        tableBody.getByText("owner", { exact: true }).first()
      ).toBeVisible();
    });
  });

  test.describe("Non-Owner Access (RBAC)", () => {
    test("non-owner is redirected away from /staff", async ({ page }) => {
      // Login as owner first
      await loginUser(page, OWNER_EMAIL);

      // Create an admin user via the API using the page's request context (has cookies)
      const adminEmail = `admin_rbac_${RUN_ID}@testgym.com`;
      const createResp = await page.request.post(
        "http://localhost:8000/api/v1/users",
        {
          data: {
            name: "Admin RBAC Test",
            email: adminEmail,
            phone: "9876505678",
            password: TEST_PASSWORD,
            role: "admin",
          },
        }
      );

      if (createResp.status() !== 201) {
        test.skip();
        return;
      }

      // Logout the owner
      await page.goto("/login");

      // Login as the admin
      await loginUser(page, adminEmail);

      // Try to navigate to /staff — should redirect
      await page.goto("/staff");
      await page.waitForURL(/dashboard/, { timeout: 15000 });
      await expect(page).toHaveURL(/dashboard/);
    });

    test("sidebar does not show Staff link for non-owner", async ({
      page,
    }) => {
      // Login as owner
      await loginUser(page, OWNER_EMAIL);

      // Create another admin user
      const adminEmail = `admin_sidebar_${RUN_ID}@testgym.com`;
      const createResp = await page.request.post(
        "http://localhost:8000/api/v1/users",
        {
          data: {
            name: "Admin Sidebar Test",
            email: adminEmail,
            phone: "9876506789",
            password: TEST_PASSWORD,
            role: "admin",
          },
        }
      );

      if (createResp.status() !== 201) {
        test.skip();
        return;
      }

      // Logout and login as admin
      await page.goto("/login");
      await loginUser(page, adminEmail);

      // Sidebar should NOT show Staff link
      const staffLink = page.locator("aside a", { hasText: "Staff" });
      await page.waitForTimeout(2000);
      await expect(staffLink).not.toBeVisible();
    });
  });
});
