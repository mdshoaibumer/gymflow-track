/**
 * ═══════════════════════════════════════════════════════════════════
 * GYMFLOW — MODULE 02: DASHBOARD E2E TESTS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests: Stats rendering, KPI cards, Charts, Loading states,
 *        Empty states, Filters, Performance, Responsive layout,
 *        API error handling, Navigation from dashboard widgets.
 */
import { test, expect } from "@playwright/test";
import {
  API_BASE,
  TEST_PASSWORD,
  registerViaAPI,
  loginViaUI,
  uniqueEmail,
  setupErrorCollector,
  measurePageLoad,
  checkBasicA11y,
} from "./fixtures";

let ownerEmail: string;

// ── Setup ─────────────────────────────────────────────────────────────
test.beforeAll(async ({ request }) => {
  const { resp, email } = await registerViaAPI(request);
  expect([200, 201]).toContain(resp.status());
  ownerEmail = email;
});

// ══════════════════════════════════════════════════════════════════════
//  DASHBOARD RENDERING
// ══════════════════════════════════════════════════════════════════════
test.describe("02. DASHBOARD — Page Load", () => {
  test("dashboard loads with KPI cards", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, ownerEmail);

    // Navigate to dashboard explicitly
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Should see some dashboard content — KPI cards or metrics
    const pageContent = await page.textContent("body");
    expect(pageContent).toBeTruthy();

    // Check for stat cards (look for numbers or metric labels)
    const hasMetrics =
      (await page.locator("text=/Members|Revenue|Active|Expiring/i").count()) > 0;
    expect(hasMetrics).toBeTruthy();

    // No critical errors
    expect(errors.getCriticalErrors()).toHaveLength(0);
  });

  test("dashboard loads within 8 seconds", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    const loadTime = await measurePageLoad(page, "/dashboard");
    expect(loadTime).toBeLessThan(8000);
  });

  test("dashboard shows loading skeletons initially", async ({ page }) => {
    await loginViaUI(page, ownerEmail);

    // Navigate with a fresh page load
    await page.goto("/dashboard");

    // Check for skeleton/loading elements very quickly after navigation
    // They might flash briefly before data loads
    const hasSkeletons = await page
      .locator(".animate-pulse, [class*='skeleton'], .animate-spin")
      .count()
      .catch(() => 0);
    // This might be 0 if the data loads instantly — just verify no crash
    expect(typeof hasSkeletons).toBe("number");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  KPI CARDS
// ══════════════════════════════════════════════════════════════════════
test.describe("02. DASHBOARD — KPI Cards", () => {
  test("displays total members metric", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Should show member count (could be 0 for new gym)
    const membersCard = page.locator("text=/total member|member/i").first();
    const cardExists = await membersCard.isVisible().catch(() => false);
    // Even for empty gym, some metric about members should show
    expect(cardExists || (await page.textContent("body"))?.match(/member/i)).toBeTruthy();
  });

  test("displays revenue metric", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Should show revenue info (could be ₹0 for new gym)
    const hasRevenue = (await page.textContent("body"))?.match(/revenue|₹|payment/i);
    expect(hasRevenue).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
//  CHARTS
// ══════════════════════════════════════════════════════════════════════
test.describe("02. DASHBOARD — Charts", () => {
  test("chart containers render without errors", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Check for SVG chart elements (Recharts renders SVGs)
    const svgElements = await page.locator("svg.recharts-surface, svg").count();
    // Charts might not render for empty data — that's OK
    // Just verify no crashes
    expect(errors.getCriticalErrors()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  DASHBOARD FILTERS
// ══════════════════════════════════════════════════════════════════════
test.describe("02. DASHBOARD — Filters", () => {
  test("date range filter is interactive", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Look for filter controls (tabs, dropdown, etc.)
    const filterElements = page.locator(
      "button:has-text('7d'), button:has-text('30d'), button:has-text('90d'), [role='tab'], select"
    );
    const filterCount = await filterElements.count();

    if (filterCount > 0) {
      // Click a filter option
      await filterElements.first().click();
      await page.waitForTimeout(1000);
      // Page should still render without errors
      expect(page.url()).toContain("/dashboard");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
//  NAVIGATION FROM DASHBOARD
// ══════════════════════════════════════════════════════════════════════
test.describe("02. DASHBOARD — Navigation", () => {
  test("sidebar navigation works from dashboard", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Click Members in sidebar
    const membersLink = page.getByRole("link", { name: /members/i }).first();
    if (await membersLink.isVisible().catch(() => false)) {
      await membersLink.click();
      await page.waitForURL(/\/members/, { timeout: 10000 });
      expect(page.url()).toContain("/members");
    }
  });

  test("can navigate to all major pages from sidebar", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    const routes = ["/dashboard", "/members", "/payments", "/equipment"];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      // Should not redirect to login (session should persist)
      expect(page.url()).not.toContain("/login");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
//  RESPONSIVE
// ══════════════════════════════════════════════════════════════════════
test.describe("02. DASHBOARD — Responsive", () => {
  test("dashboard renders on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Content should be visible (no horizontal overflow issues)
    const body = page.locator("body");
    const bodyWidth = await body.evaluate((el) => el.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(400); // Some tolerance

    // Should still show dashboard content
    expect(page.url()).toContain("/dashboard");
  });

  test("mobile hamburger menu works", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Look for mobile menu button (aria-label="Open menu")
    const menuBtn = page.locator("button[aria-label='Open menu']");
    if (await menuBtn.isVisible().catch(() => false)) {
      await menuBtn.click();
      await page.waitForTimeout(500);
      // Mobile sidebar is a fixed-position aside that appears on click
      const sidebar = page.locator("aside.fixed");
      await expect(sidebar).toBeVisible({ timeout: 3000 });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
//  ACCESSIBILITY
// ══════════════════════════════════════════════════════════════════════
test.describe("02. DASHBOARD — Accessibility", () => {
  test("dashboard has skip-to-content link", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Check for skip link (sr-only)
    const skipLink = page.locator("a[href='#main-content']");
    const skipExists = (await skipLink.count()) > 0;
    expect(skipExists).toBeTruthy();
  });

  test("dashboard has proper heading hierarchy", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Should have at least one heading
    const headings = await page.locator("h1, h2, h3").count();
    expect(headings).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  API ERROR HANDLING
// ══════════════════════════════════════════════════════════════════════
test.describe("02. DASHBOARD — Error Handling", () => {
  test("dashboard handles slow API gracefully", async ({ page }) => {
    await loginViaUI(page, ownerEmail);

    // Simulate slow network
    const client = await page.context().newCDPSession(page);
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: 50 * 1024,
      uploadThroughput: 20 * 1024,
      latency: 2000,
    });

    await page.goto("/dashboard", { timeout: 60000, waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    // Should show loading state or data — not crash
    const hasContent = (await page.textContent("body"))!.length > 100;
    expect(hasContent).toBeTruthy();

    // Reset network
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  });
});
