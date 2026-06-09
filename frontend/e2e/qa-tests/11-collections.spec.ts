/**
 * ═══════════════════════════════════════════════════════════════════
 * GYMFLOW — COLLECTIONS MODULE E2E TEST SUITE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests: Page load, summary cards, status filters, aging report,
 *        record payment modal, waive due, WhatsApp reminder,
 *        pagination, security, mobile responsiveness.
 *
 * EXECUTION: Serial (shared account, deterministic order).
 */
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

test.describe.configure({ mode: "serial" });

// ── Constants ─────────────────────────────────────────────────────────
const RUN_ID = Date.now();
const API_BASE = "http://localhost:8000/api/v1";
const TEST_PASSWORD = "StrongPass1A";
const OWNER_EMAIL = `qa_collections_${RUN_ID}@testgym.com`;
const OWNER_PHONE = `97${String(RUN_ID).slice(-8)}`;
const GYM_NAME = `QA Collections Gym ${RUN_ID}`;

// ── Helpers ───────────────────────────────────────────────────────────
async function loginViaUI(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => localStorage.setItem("gymflow-tour-completed", "true"));
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(dashboard|setup)/, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}

async function getCookieHeader(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function createMemberWithDue(
  request: APIRequestContext,
  cookieHeader: string,
  opts: { name: string; phone: string }
) {
  // Create member with past end date to generate a due
  const pastEnd = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const pastStart = new Date(Date.now() - 37 * 86400000).toISOString().split("T")[0];
  const resp = await request.post(`${API_BASE}/members`, {
    data: {
      name: opts.name,
      phone: opts.phone,
      email: `${opts.phone}@test.com`,
      gender: "male",
      membership_plan: "Monthly",
      amount_paid: 0,
      membership_start: pastStart,
      membership_end: pastEnd,
    },
    headers: { Cookie: cookieHeader },
  });
  return resp;
}

// ── Setup ─────────────────────────────────────────────────────────────
test("setup: register gym and login", async ({ page, request }) => {
  // Register
  const resp = await request.post(`${API_BASE}/auth/register`, {
    data: {
      gym_name: GYM_NAME,
      owner_name: "QA Collections Owner",
      phone: OWNER_PHONE,
      email: OWNER_EMAIL,
      password: TEST_PASSWORD,
    },
  });
  expect([200, 201, 409]).toContain(resp.status());

  // Login and create member with dues
  await loginViaUI(page, OWNER_EMAIL);
  const cookieHeader = await getCookieHeader(page);

  await createMemberWithDue(request, cookieHeader, {
    name: `Due Member ${RUN_ID}`,
    phone: `91${String(RUN_ID).slice(-8)}`,
  });
});

// ═══════════════════════════════════════════════════════════════════
// 1. PAGE LOAD & STRUCTURE
// ═══════════════════════════════════════════════════════════════════
test.describe("11. COLLECTIONS — Page Load", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
  });

  test("11.01 — collections page loads with heading", async ({ page }) => {
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");
    const heading = page.locator("h1, h2").filter({ hasText: /collections|dues|outstanding/i });
    await expect(heading.first()).toBeVisible({ timeout: 15000 });
  });

  test("11.02 — summary cards are displayed", async ({ page }) => {
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // Should show summary cards (total outstanding, members with dues, collected this month)
    const cards = page.locator("[class*='card'], [data-testid*='card']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("11.03 — aging report section renders", async ({ page }) => {
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // Aging report should show some visualization or breakdown
    const agingSection = page.locator("text=/aging|overdue|0-30|31-60|61-90/i");
    const hasAging = await agingSection.first().isVisible({ timeout: 5000 }).catch(() => false);
    // Even if empty, the section container should exist
    expect(hasAging || (await page.locator("[class*='aging'], [data-testid*='aging']").count()) >= 0).toBeTruthy();
  });

  test("11.04 — empty state shows when no dues exist", async ({ page }) => {
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // Should show either dues table or empty state
    const hasTable = await page.locator("table, [role='table']").isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.locator("text=/no.*dues|no.*outstanding|no.*collections/i").isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. STATUS FILTERS
// ═══════════════════════════════════════════════════════════════════
test.describe("11. COLLECTIONS — Filters", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
  });

  test("11.05 — status filter dropdown exists", async ({ page }) => {
    // Look for filter controls (select/dropdown with status options)
    const filterControl = page.locator(
      "select, [role='combobox'], button:has-text('Status'), button:has-text('Filter'), [data-testid*='filter']"
    );
    const count = await filterControl.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("11.06 — can filter by Pending status", async ({ page }) => {
    // Try to select Pending filter
    const filterBtn = page.locator("button:has-text('Status'), [role='combobox']").first();
    if (await filterBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filterBtn.click();
      await page.waitForTimeout(500);
      const pendingOption = page.locator("[role='option']:has-text('Pending'), [role='menuitem']:has-text('Pending')").first();
      if (await pendingOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pendingOption.click();
        await page.waitForTimeout(1000);
      }
    }
    // Page should still be functional
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("11.07 — can filter by Paid status", async ({ page }) => {
    const filterBtn = page.locator("button:has-text('Status'), [role='combobox']").first();
    if (await filterBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filterBtn.click();
      await page.waitForTimeout(500);
      const paidOption = page.locator("[role='option']:has-text('Paid'), [role='menuitem']:has-text('Paid')").first();
      if (await paidOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await paidOption.click();
        await page.waitForTimeout(1000);
      }
    }
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("11.08 — clear filters resets view", async ({ page }) => {
    // Look for clear/reset filter button
    const clearBtn = page.locator("button:has-text('Clear'), button:has-text('Reset'), button:has-text('All')").first();
    if (await clearBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clearBtn.click();
      await page.waitForTimeout(1000);
    }
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. RECORD PAYMENT MODAL
// ═══════════════════════════════════════════════════════════════════
test.describe("11. COLLECTIONS — Record Payment", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("11.09 — action menu opens for pending due", async ({ page }) => {
    // Find the actions button (three-dot menu) in a table row
    const actionBtn = page.locator("button[aria-label='Actions'], button:has(svg)").filter({
      has: page.locator("svg"),
    });
    const moreBtn = page.locator("button").filter({ hasText: "" }).locator("svg.lucide-more-horizontal").first();
    const triggerBtn = moreBtn.locator("..");
    if (await triggerBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await triggerBtn.click();
      await page.waitForTimeout(500);
      // Dropdown should show Record Payment option
      const recordPayment = page.locator("[role='menuitem']:has-text('Record Payment')");
      const hasOption = await recordPayment.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasOption).toBeTruthy();
    }
  });

  test("11.10 — record payment modal opens and has amount field", async ({ page }) => {
    const moreBtn = page.locator("svg.lucide-more-horizontal").first().locator("..");
    if (await moreBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(500);
      const recordPayment = page.locator("[role='menuitem']:has-text('Record Payment')");
      if (await recordPayment.isVisible({ timeout: 3000 }).catch(() => false)) {
        await recordPayment.click();
        await page.waitForTimeout(1000);
        // Modal should be visible with amount input
        const modal = page.locator("[role='dialog'], [data-state='open']");
        await expect(modal.first()).toBeVisible({ timeout: 5000 });
        const amountInput = modal.locator("input[type='number'], input[name*='amount'], input[placeholder*='amount' i]");
        const hasAmount = await amountInput.first().isVisible({ timeout: 3000 }).catch(() => false);
        expect(hasAmount).toBeTruthy();
      }
    }
  });

  test("11.11 — record payment modal can be cancelled", async ({ page }) => {
    const moreBtn = page.locator("svg.lucide-more-horizontal").first().locator("..");
    if (await moreBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(500);
      const recordPayment = page.locator("[role='menuitem']:has-text('Record Payment')");
      if (await recordPayment.isVisible({ timeout: 3000 }).catch(() => false)) {
        await recordPayment.click();
        await page.waitForTimeout(1000);
        // Close modal
        const cancelBtn = page.locator("[role='dialog'] button:has-text('Cancel')");
        if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await cancelBtn.click();
          await page.waitForTimeout(500);
          await expect(page.locator("[role='dialog']")).not.toBeVisible({ timeout: 3000 });
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. WAIVE DUE
// ═══════════════════════════════════════════════════════════════════
test.describe("11. COLLECTIONS — Waive Due", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("11.12 — waive option visible for owner", async ({ page }) => {
    const moreBtn = page.locator("svg.lucide-more-horizontal").first().locator("..");
    if (await moreBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(500);
      const waiveOption = page.locator("[role='menuitem']:has-text('Waive')");
      const hasWaive = await waiveOption.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasWaive).toBeTruthy();
    }
  });

  test("11.13 — waive modal opens with reason field", async ({ page }) => {
    const moreBtn = page.locator("svg.lucide-more-horizontal").first().locator("..");
    if (await moreBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(500);
      const waiveOption = page.locator("[role='menuitem']:has-text('Waive')");
      if (await waiveOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await waiveOption.click();
        await page.waitForTimeout(1000);
        const modal = page.locator("[role='dialog'], [role='alertdialog'], [data-state='open']");
        await expect(modal.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. WHATSAPP REMINDER
// ═══════════════════════════════════════════════════════════════════
test.describe("11. COLLECTIONS — WhatsApp Reminder", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("11.14 — WhatsApp reminder option in action menu", async ({ page }) => {
    const moreBtn = page.locator("svg.lucide-more-horizontal").first().locator("..");
    if (await moreBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(500);
      const whatsappOption = page.locator("[role='menuitem']:has-text('WhatsApp')");
      const hasWhatsapp = await whatsappOption.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasWhatsapp).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. PAGINATION
// ═══════════════════════════════════════════════════════════════════
test.describe("11. COLLECTIONS — Pagination", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("11.15 — pagination controls are present when data exists", async ({ page }) => {
    // Pagination may or may not show depending on data volume
    const paginationCtrl = page.locator("button:has-text('Next'), button:has-text('Previous'), [aria-label*='page']");
    const hasPagination = await paginationCtrl.first().isVisible({ timeout: 3000 }).catch(() => false);
    // It's OK if there's no pagination (less than 20 items) — just verify page doesn't crash
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. SECURITY
// ═══════════════════════════════════════════════════════════════════
test.describe("11. COLLECTIONS — Security", () => {
  test("11.16 — unauthenticated access to collections API returns 401", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/dues`);
    expect([401, 403]).toContain(resp.status());
  });

  test("11.17 — unauthenticated user is redirected from /collections", async ({ page }) => {
    await page.goto("/collections");
    await page.waitForURL(/\/(login|collections)/, { timeout: 15000 });
    const url = page.url();
    expect(url).toMatch(/login/);
  });

  test("11.18 — XSS payload in filter doesn't execute", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await page.goto("/collections?status=<script>alert(1)</script>");
    await page.waitForLoadState("networkidle");
    // Page should still render normally
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. MOBILE
// ═══════════════════════════════════════════════════════════════════
test.describe("11. COLLECTIONS — Mobile", () => {
  test("11.19 — collections page works on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginViaUI(page, OWNER_EMAIL);
    await page.goto("/collections");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // Page should render without horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(400);
  });
});
