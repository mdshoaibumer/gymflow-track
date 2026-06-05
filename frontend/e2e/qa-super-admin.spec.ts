/**
 * ═══════════════════════════════════════════════════════════════════
 * GYMFLOW — SUPER ADMIN CONTROL CENTER E2E TEST SUITE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests the Super Admin Control Center via Playwright + Chromium:
 *   1. Login as super admin via UI → redirect to /admin
 *   2. Dashboard, Gym Directory, Subscriptions, Analytics,
 *      Health, Audit Logs, Settings pages
 *   3. API-level checks for all admin endpoints
 *
 * Prerequisites:
 *   - Backend on :8000 (python run_sqlite_server.py)
 *   - Frontend on :3000 (npm run dev)
 *   - Super admin seeded: admin@gymflowtrack.in / SuperAdmin@2026!
 */
import { test, expect, type Page, type BrowserContext, type APIRequestContext } from "@playwright/test";

const API_BASE = "http://localhost:8000/api/v1";
const ADMIN_EMAIL = "admin@gymflowtrack.in";
const ADMIN_PASSWORD = "SuperAdmin@2026!";

// ── Helpers ──────────────────────────────────────────────────────────

/** Login via API and inject auth cookies into the browser context. */
async function loginViaAPI(context: BrowserContext, request: APIRequestContext) {
  // Hit the backend directly to get Set-Cookie headers
  const resp = await request.post(`${API_BASE}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(resp.ok(), `API login failed: ${resp.status()}`).toBeTruthy();

  // Extract cookies from the API response and inject into the browser context
  const cookies = await resp.headersArray();
  const setCookieHeaders = cookies.filter((h) => h.name.toLowerCase() === "set-cookie");

  for (const header of setCookieHeaders) {
    const parts = header.value.split(";")[0].split("=");
    const name = parts[0].trim();
    const value = parts.slice(1).join("=").trim();
    await context.addCookies([
      {
        name,
        value,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
}

/** Register a test gym so directory isn't empty. */
async function seedTestGym(request: APIRequestContext) {
  const runId = Date.now();
  const resp = await request.post(`${API_BASE}/auth/register`, {
    data: {
      gym_name: `E2E Test Gym ${runId}`,
      owner_name: "Test Owner",
      phone: `98${String(runId).slice(-8)}`,
      email: `e2e_owner_${runId}@test.com`,
      password: "TestPass123!",
    },
  });
  if (resp.ok()) {
    const body = await resp.json();
    return { gymId: body.gym_id, gymName: `E2E Test Gym ${runId}` };
  }
  return null;
}

/** Navigate to /admin after injecting auth cookies. */
async function goToAdmin(page: Page, context: BrowserContext, request: APIRequestContext) {
  await loginViaAPI(context, request);
  await page.goto("/admin", { waitUntil: "networkidle" });
  // Wait for the admin layout to settle (auth check + render)
  await page.waitForTimeout(3000);
}

// ══════════════════════════════════════════════════════════════════════
// 1. SUPER ADMIN LOGIN VIA UI
// ══════════════════════════════════════════════════════════════════════
test.describe("1 — SUPER ADMIN LOGIN", () => {
  test("login with super admin credentials redirects to /admin", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible({ timeout: 10000 });

    await page.fill("#email", ADMIN_EMAIL);
    await page.fill("#password", ADMIN_PASSWORD);
    await page.click("button[type='submit']");

    // Should redirect to /admin (not /dashboard)
    await expect(page).toHaveURL(/\/admin/, { timeout: 20000 });
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2. ADMIN DASHBOARD (via API login + cookie injection)
// ══════════════════════════════════════════════════════════════════════
test.describe("2 — ADMIN DASHBOARD", () => {
  test("dashboard shows Platform Command Center heading", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    await expect(page.locator("h1")).toContainText(/Platform Command Center|Admin/i, { timeout: 10000 });
  });

  test("dashboard shows key metric cards", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    // Wait for the page to fully render and metrics to load
    await page.waitForTimeout(8000);
    // Take a screenshot to debug what the page actually looks like
    await page.screenshot({ path: "test-results/dashboard-debug.png", fullPage: true });
    // Check if the MetricCard titles appear
    const content = await page.textContent("body");
    console.log("Dashboard body text (first 2000 chars):", content?.slice(0, 2000));
    await expect(page.getByText("Total Gyms")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Active Subscriptions", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Trial Gyms")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Total Members")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("MRR").first()).toBeVisible({ timeout: 5000 });
  });

  test("dashboard shows chart sections", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    await page.waitForTimeout(8000);
    // Charts render after metrics load - check for card headers (not h1-h6 roles, they use CardTitle)
    await expect(page.locator("text=Revenue Trend").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Gym Growth").first()).toBeVisible({ timeout: 5000 });
  });

  test("sidebar has all navigation items", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    const navItems = ["Dashboard", "Gym Directory", "Subscriptions", "Analytics", "Health", "Audit Logs", "Settings"];
    for (const item of navItems) {
      await expect(page.locator(`text="${item}"`).first()).toBeVisible({ timeout: 5000 });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// 3. GYM DIRECTORY
// ══════════════════════════════════════════════════════════════════════
test.describe("3 — GYM DIRECTORY", () => {
  test("gym directory page loads with table", async ({ page, context, request }) => {
    await seedTestGym(request);
    await goToAdmin(page, context, request);

    await page.click("text=Gym Directory");
    await expect(page).toHaveURL(/\/admin\/gyms/, { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Gym Directory");
    await expect(page.locator("input[placeholder*='Search']")).toBeVisible({ timeout: 10000 });
  });

  test("gym directory search filters results", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    await page.click("text=Gym Directory");
    await expect(page).toHaveURL(/\/admin\/gyms/, { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Search for a non-existent gym
    await page.fill("input[placeholder*='Search']", "xyznonexistent999");
    await page.waitForTimeout(1500);
    // Should show empty or "No gyms found"
    const noResults = page.locator("text=No gyms found");
    const tableRows = page.locator("table tbody tr");
    const hasNoResults = await noResults.isVisible().catch(() => false);
    const rowCount = await tableRows.count().catch(() => 0);
    expect(hasNoResults || rowCount === 0).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
// 4. SUBSCRIPTIONS PAGE
// ══════════════════════════════════════════════════════════════════════
test.describe("4 — SUBSCRIPTIONS PAGE", () => {
  test("subscriptions page loads", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    await page.click("text=Subscriptions");
    await expect(page).toHaveURL(/\/admin\/subscriptions/, { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Subscription Control Center");
  });
});

// ══════════════════════════════════════════════════════════════════════
// 5. ANALYTICS PAGE
// ══════════════════════════════════════════════════════════════════════
test.describe("5 — ANALYTICS PAGE", () => {
  test("analytics page loads with charts", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    await page.click("text=Analytics");
    await expect(page).toHaveURL(/\/admin\/analytics/, { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Platform Analytics");
    await expect(page.locator("text=Member Growth")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Revenue Trend")).toBeVisible();
    await expect(page.locator("text=Top Gyms by Revenue")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Feature Adoption" })).toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════════════════
// 6. HEALTH MONITORING PAGE
// ══════════════════════════════════════════════════════════════════════
test.describe("6 — HEALTH MONITORING PAGE", () => {
  test("health page loads with status indicator", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    await page.click("text=Health");
    await expect(page).toHaveURL(/\/admin\/health/, { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Platform Health");

    // Status should show (healthy/degraded/critical)
    await expect(
      page.locator("text=healthy").or(page.locator("text=degraded")).or(page.locator("text=critical"))
    ).toBeVisible({ timeout: 10000 });
  });

  test("health page has refresh button", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    await page.click("text=Health");
    await expect(page).toHaveURL(/\/admin\/health/, { timeout: 10000 });
    await expect(page.locator("button:has-text('Refresh')")).toBeVisible({ timeout: 10000 });
  });
});

// ══════════════════════════════════════════════════════════════════════
// 7. AUDIT LOGS PAGE
// ══════════════════════════════════════════════════════════════════════
test.describe("7 — AUDIT LOGS PAGE", () => {
  test("audit logs page loads", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    await page.click("text=Audit Logs");
    await expect(page).toHaveURL(/\/admin\/audit-logs/, { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Audit Logs");
  });

  test("audit logs page has action filter", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    await page.click("text=Audit Logs");
    await expect(page).toHaveURL(/\/admin\/audit-logs/, { timeout: 10000 });
    await expect(page.locator("text=All Actions")).toBeVisible({ timeout: 10000 });
  });
});

// ══════════════════════════════════════════════════════════════════════
// 8. PLATFORM SETTINGS PAGE
// ══════════════════════════════════════════════════════════════════════
test.describe("8 — PLATFORM SETTINGS PAGE", () => {
  test("settings page loads with configuration sections", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    await page.click("text=Settings");
    await expect(page).toHaveURL(/\/admin\/settings/, { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Platform Settings");
    await expect(page.locator("text=Trial & Billing Configuration")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Maintenance Mode" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Platform Announcement" })).toBeVisible();
  });

  test("settings page shows default values", async ({ page, context, request }) => {
    await goToAdmin(page, context, request);
    await page.click("text=Settings");
    await expect(page).toHaveURL(/\/admin\/settings/, { timeout: 10000 });
    await page.waitForTimeout(3000);

    const trialInput = page.locator("#trial-days");
    await expect(trialInput).toBeVisible({ timeout: 10000 });
    // Default trial days is 3 (or 21 if a previous test changed it)
    const val = await trialInput.inputValue();
    expect(["3", "21"]).toContain(val);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 9. API ENDPOINT TESTS (Super Admin Endpoints)
// ══════════════════════════════════════════════════════════════════════
test.describe("9 — API ENDPOINT TESTS", () => {
  test("GET /admin/metrics returns enhanced metrics", async ({ request }) => {
    // Use a fresh login — Playwright request contexts can have stale cookies
    // from seedTestGym in other tests running in the same worker.
    const loginResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(loginResp.ok(), `login for metrics test failed: ${loginResp.status()}`).toBeTruthy();

    const resp = await request.get(`${API_BASE}/admin/metrics`);
    if (!resp.ok()) {
      console.log("Metrics response:", resp.status(), await resp.text());
    }
    expect(resp.ok(), `metrics failed: ${resp.status()} ${await resp.text()}`).toBeTruthy();
    const data = await resp.json();

    expect(data).toHaveProperty("total_gyms");
    expect(data).toHaveProperty("active_subscriptions");
    expect(data).toHaveProperty("trial_gyms");
    expect(data).toHaveProperty("total_members");
    expect(data).toHaveProperty("mrr_in_paise");
    expect(data).toHaveProperty("arr_in_paise");
    expect(data).toHaveProperty("plan_distribution");
    expect(data).toHaveProperty("gym_growth_trend");
    expect(data).toHaveProperty("revenue_trend");
  });

  test("GET /admin/analytics returns analytics data", async ({ request }) => {
    await request.post(`${API_BASE}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    const resp = await request.get(`${API_BASE}/admin/analytics`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();

    expect(data).toHaveProperty("member_growth");
    expect(data).toHaveProperty("gym_growth");
    expect(data).toHaveProperty("revenue_trend");
    expect(data).toHaveProperty("top_gyms");
    expect(data).toHaveProperty("inactive_gyms");
    expect(data).toHaveProperty("feature_adoption");
  });

  test("GET /admin/health returns health data", async ({ request }) => {
    await request.post(`${API_BASE}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    const resp = await request.get(`${API_BASE}/admin/health`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();

    expect(data).toHaveProperty("status");
    expect(["healthy", "degraded", "critical"]).toContain(data.status);
    expect(data).toHaveProperty("failed_payments_24h");
    expect(data).toHaveProperty("alerts");
  });

  test("GET /admin/settings returns platform settings", async ({ request }) => {
    await request.post(`${API_BASE}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    const resp = await request.get(`${API_BASE}/admin/settings`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();

    expect(data).toHaveProperty("default_trial_days");
    expect(data).toHaveProperty("maintenance_mode");
    expect(data.maintenance_mode).toBe(false);
  });

  test("PUT /admin/settings updates settings", async ({ request }) => {
    await request.post(`${API_BASE}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    const resp = await request.put(`${API_BASE}/admin/settings`, {
      data: { default_trial_days: 21 },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.default_trial_days).toBe(21);

    // Reset back
    await request.put(`${API_BASE}/admin/settings`, {
      data: { default_trial_days: 3 },
    });
  });

  test("GET /admin/audit-logs returns logs", async ({ request }) => {
    await request.post(`${API_BASE}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    const resp = await request.get(`${API_BASE}/admin/audit-logs`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();

    expect(data).toHaveProperty("entries");
    expect(data).toHaveProperty("total");
    expect(Array.isArray(data.entries)).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
// 10. GYM DETAIL PAGE
// ══════════════════════════════════════════════════════════════════════
test.describe("10 — GYM DETAIL PAGE", () => {
  let gymId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const result = await seedTestGym(request);
    if (result) gymId = result.gymId;
  });

  test("gym detail API returns subscription_timeline", async ({ request }) => {
    test.skip(!gymId, "No test gym available");

    await request.post(`${API_BASE}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    const resp = await request.get(`${API_BASE}/admin/gyms/${gymId}`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();

    expect(data).toHaveProperty("subscription_timeline");
    expect(Array.isArray(data.subscription_timeline)).toBeTruthy();
    expect(data).toHaveProperty("staff");
    expect(data).toHaveProperty("invoices");
  });

  test("gym detail page loads with profile sections", async ({ page, context, request }) => {
    test.skip(!gymId, "No test gym available");

    await goToAdmin(page, context, request);
    await page.goto(`/admin/gyms/${gymId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(5000);

    await expect(page.locator("text=Gym Profile")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Owner Details")).toBeVisible();
  });
});
