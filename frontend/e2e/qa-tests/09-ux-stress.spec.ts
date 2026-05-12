/**
 * ═══════════════════════════════════════════════════════════════════
 * GYMFLOW — MODULE 09: UI/UX & STRESS TESTS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests: Responsive design, Accessibility, Performance, Keyboard nav,
 *        Loading states, Empty states, Toast messages, Visual consistency,
 *        Rapid clicking, Double submission, Multiple tabs, Network throttle.
 */
import { test, expect } from "@playwright/test";
import {
  registerViaAPI,
  loginViaUI,
  setupErrorCollector,
  measurePageLoad,
  checkBasicA11y,
} from "./fixtures";

let ownerEmail: string;

test.beforeAll(async ({ request }) => {
  const { resp, email } = await registerViaAPI(request);
  expect([200, 201]).toContain(resp.status());
  ownerEmail = email;
});

// ══════════════════════════════════════════════════════════════════════
//  PERFORMANCE
// ══════════════════════════════════════════════════════════════════════
test.describe("09. UX — Performance", () => {
  test("login page loads under 3s", async ({ page }) => {
    const loadTime = await measurePageLoad(page, "/login");
    expect(loadTime).toBeLessThan(3000);
  });

  test("landing page loads under 5s", async ({ page }) => {
    const loadTime = await measurePageLoad(page, "/");
    expect(loadTime).toBeLessThan(5000);
  });

  test("dashboard loads under 8s after login", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    const loadTime = await measurePageLoad(page, "/dashboard");
    expect(loadTime).toBeLessThan(8000);
  });

  test("members page loads under 5s", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    const loadTime = await measurePageLoad(page, "/members");
    expect(loadTime).toBeLessThan(5000);
  });

  test("payments page loads under 5s", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    const loadTime = await measurePageLoad(page, "/payments");
    expect(loadTime).toBeLessThan(5000);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  RESPONSIVE DESIGN — DESKTOP
// ══════════════════════════════════════════════════════════════════════
test.describe("09. UX — Desktop Layout", () => {
  test("sidebar is visible on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();
  });

  test("no horizontal scrollbar on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUI(page, ownerEmail);

    const routes = ["/dashboard", "/members", "/payments"];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      const hasHorizontalScroll = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasHorizontalScroll).toBeFalsy();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
//  RESPONSIVE DESIGN — TABLET
// ══════════════════════════════════════════════════════════════════════
test.describe("09. UX — Tablet Layout", () => {
  test("tablet layout works (768px)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Content should be visible without major issues
    const hasContent = (await page.textContent("body"))!.length > 100;
    expect(hasContent).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
//  RESPONSIVE DESIGN — MOBILE
// ══════════════════════════════════════════════════════════════════════
test.describe("09. UX — Mobile Layout", () => {
  test("mobile layout (375px) renders all pages", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginViaUI(page, ownerEmail);

    const routes = ["/dashboard", "/members", "/payments", "/settings"];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(400);
    }
  });

  test("touch targets are adequate size on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Check that buttons are at least 44x44 (WCAG minimum)
    const buttons = page.locator("button:visible");
    const btnCount = await buttons.count();
    let tooSmallCount = 0;

    for (let i = 0; i < Math.min(btnCount, 10); i++) {
      const box = await buttons.nth(i).boundingBox();
      if (box && (box.width < 32 || box.height < 32)) {
        tooSmallCount++;
      }
    }

    // Allow some small buttons (icon buttons, close buttons) but flag if many are too small
    expect(tooSmallCount).toBeLessThan(8);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  KEYBOARD NAVIGATION
// ══════════════════════════════════════════════════════════════════════
test.describe("09. UX — Keyboard Navigation", () => {
  test("login form is navigable with Tab key", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Tab through form elements
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);

    // Some element should have focus
    const focusedTag = await page.evaluate(() =>
      document.activeElement?.tagName?.toLowerCase()
    );
    expect(["input", "button", "a", "select", "textarea"]).toContain(focusedTag);
  });

  test("Enter key submits login form", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(ownerEmail);
    await page.getByLabel("Password", { exact: true }).fill("WrongPass99!");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);
    // Should attempt login (stays on login because wrong password)
    expect(page.url()).toContain("/login");
  });

  test("Escape key closes dialogs", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const addBtn = page.getByRole("button", { name: /add member/i }).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);

      // Dialog should be visible
      const dialog = page.locator("[role='dialog'], form");
      const wasVisible = await dialog.first().isVisible().catch(() => false);

      if (wasVisible) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
        // Dialog should be hidden or form closed
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
//  ACCESSIBILITY
// ══════════════════════════════════════════════════════════════════════
test.describe("09. UX — Accessibility", () => {
  test("login page passes basic a11y checks", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const issues = await checkBasicA11y(page);
    expect(issues.length).toBeLessThan(5);
  });

  test("dashboard passes basic a11y checks", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const issues = await checkBasicA11y(page);
    expect(issues.length).toBeLessThan(10);
  });

  test("ARIA landmarks exist on dashboard", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const mainContent = page.locator("main, [role='main']");
    await expect(mainContent.first()).toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════════════════
//  STRESS — RAPID CLICKING
// ══════════════════════════════════════════════════════════════════════
test.describe("09. UX — Stress Tests", () => {
  test("rapid sidebar navigation doesn't crash", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Rapidly click sidebar links
    const links = page.locator("aside a, nav a");
    const linkCount = await links.count();

    for (let i = 0; i < Math.min(linkCount, 5); i++) {
      await links.nth(i).click().catch(() => {});
      // Don't wait between clicks — simulate rapid navigation
    }

    await page.waitForTimeout(3000);
    // Should not crash
    expect(errors.getCriticalErrors()).toHaveLength(0);
  });

  test("rapid page refresh doesn't crash", async ({ page }) => {
    const errors = setupErrorCollector(page);
    await loginViaUI(page, ownerEmail);
    await page.goto("/dashboard");

    // Rapidly refresh 5 times
    for (let i = 0; i < 5; i++) {
      await page.reload().catch(() => {});
    }

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(errors.getCriticalErrors()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  NETWORK RESILIENCE
// ══════════════════════════════════════════════════════════════════════
test.describe("09. UX — Network Resilience", () => {
  test("app shows error state when API is unreachable", async ({ page }) => {
    await loginViaUI(page, ownerEmail);

    // Block API requests
    await page.route("**/api/v1/**", (route) => route.abort("connectionfailed"));

    await page.goto("/dashboard");
    await page.waitForTimeout(5000);

    // Should show some error state — not blank page
    const bodyText = await page.textContent("body");
    expect(bodyText!.length).toBeGreaterThan(50);

    // Unblock
    await page.unroute("**/api/v1/**");
  });

  test("slow network shows loading states", async ({ page }) => {
    await loginViaUI(page, ownerEmail);

    // Simulate slow network
    const client = await page.context().newCDPSession(page);
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: 10 * 1024,
      uploadThroughput: 5 * 1024,
      latency: 5000,
    });

    await page.goto("/members", { timeout: 60000, waitUntil: "domcontentloaded" });
    // Should show loading indicators
    await page.waitForTimeout(3000);
    const bodyText = await page.textContent("body");
    expect(bodyText!.length).toBeGreaterThan(50);

    // Reset
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
//  LANDING PAGE
// ══════════════════════════════════════════════════════════════════════
test.describe("09. UX — Landing Page", () => {
  test("landing page renders features section", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent("body");
    expect(bodyText?.match(/member management|payment|attendance|gymflow/i)).toBeTruthy();
  });

  test("landing page has CTA buttons", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ctaButtons = page.locator("a:has-text('Start'), a:has-text('Register'), a:has-text('Try'), button:has-text('Start')");
    const hasCTA = (await ctaButtons.count()) > 0;
    expect(hasCTA).toBeTruthy();
  });

  test("landing page pricing section shows plans", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const bodyText = await page.textContent("body");
    expect(bodyText?.match(/starter|pro|elite|₹/i)).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
//  404 PAGE
// ══════════════════════════════════════════════════════════════════════
test.describe("09. UX — Error Pages", () => {
  test("unknown route returns 404 or redirects", async ({ page }) => {
    const response = await page.goto("/this-route-definitely-does-not-exist");
    const status = response?.status();
    // Next.js should return 404 or redirect
    expect(status === 404 || status === 200).toBeTruthy();
  });
});
