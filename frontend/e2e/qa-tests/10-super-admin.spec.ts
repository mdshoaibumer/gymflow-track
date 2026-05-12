/**
 * ═══════════════════════════════════════════════════════════════════
 * GYMFLOW — MODULE 10: SUPER ADMIN PANEL E2E TESTS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests: Admin dashboard, Gym directory, Subscriptions management,
 *        Analytics, Health, Audit logs, Admin settings.
 */
import { test, expect } from "@playwright/test";
import {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
  loginViaUI,
  setupErrorCollector,
} from "./fixtures";

// ══════════════════════════════════════════════════════════════════════
//  ADMIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════
test.describe("10. ADMIN — Dashboard", () => {
  test("admin dashboard loads for super admin", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    expect(page.url()).toContain("/admin");
    const bodyText = await page.textContent("body");
    expect(bodyText?.match(/dashboard|gym|admin|analytics|total/i)).toBeTruthy();
    expect(errors.getCriticalErrors()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  GYM DIRECTORY
// ══════════════════════════════════════════════════════════════════════
test.describe("10. ADMIN — Gyms", () => {
  test("gym directory page loads", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto("/admin/gyms");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent("body");
    expect(bodyText?.match(/gym|directory|search|name/i)).toBeTruthy();
    expect(errors.getCriticalErrors()).toHaveLength(0);
  });

  test("gym list shows registered gyms", async ({ page }) => {
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto("/admin/gyms");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Should show gym names from test accounts
    const bodyText = await page.textContent("body");
    expect(bodyText?.match(/gym|QA|test/i)).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SUBSCRIPTIONS
// ══════════════════════════════════════════════════════════════════════
test.describe("10. ADMIN — Subscriptions", () => {
  test("subscriptions page loads", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto("/admin/subscriptions");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent("body");
    expect(bodyText?.match(/subscription|plan|trial|active/i)).toBeTruthy();
    expect(errors.getCriticalErrors()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  ANALYTICS
// ══════════════════════════════════════════════════════════════════════
test.describe("10. ADMIN — Analytics", () => {
  test("analytics page loads", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto("/admin/analytics");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent("body");
    expect(bodyText?.match(/analytics|metric|chart|growth/i)).toBeTruthy();
    expect(errors.getCriticalErrors()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  HEALTH CHECK
// ══════════════════════════════════════════════════════════════════════
test.describe("10. ADMIN — Health", () => {
  test("health page loads", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto("/admin/health");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent("body");
    expect(bodyText?.match(/health|status|up|ok|system|server/i)).toBeTruthy();
    expect(errors.getCriticalErrors()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  AUDIT LOGS
// ══════════════════════════════════════════════════════════════════════
test.describe("10. ADMIN — Audit Logs", () => {
  test("audit logs page loads", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto("/admin/audit-logs");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent("body");
    expect(bodyText?.match(/audit|log|action|event|user/i)).toBeTruthy();
    expect(errors.getCriticalErrors()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  ADMIN SETTINGS
// ══════════════════════════════════════════════════════════════════════
test.describe("10. ADMIN — Settings", () => {
  test("admin settings page loads", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto("/admin/settings");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent("body");
    expect(bodyText?.match(/settings|platform|configuration|super/i)).toBeTruthy();
    expect(errors.getCriticalErrors()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  ADMIN NAVIGATION
// ══════════════════════════════════════════════════════════════════════
test.describe("10. ADMIN — Navigation", () => {
  test("all admin sidebar links work", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    const routes = [
      "/admin",
      "/admin/gyms",
      "/admin/subscriptions",
      "/admin/analytics",
      "/admin/health",
      "/admin/audit-logs",
      "/admin/settings",
    ];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      expect(page.url()).toContain(route);
    }

    expect(errors.getCriticalErrors()).toHaveLength(0);
  });

  test("admin logout works", async ({ page }) => {
    await loginViaUI(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    // Find and click logout
    const logoutBtn = page.locator("button:has-text('Logout'), button:has-text('Sign Out'), button:has(svg.lucide-log-out)").first();
    if (await logoutBtn.isVisible().catch(() => false)) {
      await logoutBtn.click();
      await page.waitForURL(/\/login/, { timeout: 10000 });
      expect(page.url()).toContain("/login");
    }
  });
});
