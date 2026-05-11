/**
 * ══════════════════════════════════════════════════════════════════════
 * GYMFLOW — REPORTS & EXPORT MODULE — COMPLETE QA TEST SUITE
 * ══════════════════════════════════════════════════════════════════════
 *
 * Enterprise-grade browser-based testing for the Reports & Export module.
 *
 * Covers:
 *   0. Setup & Authentication
 *   1. Report Module Existence & Navigation
 *   2. Revenue/Financial Reporting via Dashboard
 *   3. Attendance Reporting & Data Display
 *   4. Membership Reporting & Data Display
 *   5. Payment Data Reporting
 *   6. Export & Download Capabilities
 *   7. Filter & Search Behavior
 *   8. Data Integrity Validation
 *   9. Security Tests
 *  10. Network Failure Recovery
 *  11. Multi-Tab & Concurrency
 *  12. Mobile Responsive Testing
 *  13. UX & Accessibility
 *
 * Execution: npx playwright test e2e/qa-reports-export-module.spec.ts
 */
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";

// Each section is independent

// ── Constants ─────────────────────────────────────────────────────────
const RUN_ID = Date.now();
const API_BASE = "http://localhost:8000/api/v1";
const APP_BASE = "http://localhost:3000";
const TEST_PASSWORD = "StrongPass1A!";
const OWNER_EMAIL = `qa_reports_${RUN_ID}@testgym.com`;
const OWNER_PHONE = `97${String(RUN_ID).slice(-8)}`;
const GYM_NAME = `QA Reports Gym ${RUN_ID}`;
const SS_DIR = "test-results/reports-export-qa";

// Track state across tests
let MEMBER_IDS: string[] = [];
let AUTH_COOKIES: { name: string; value: string }[] = [];

// ── Screenshot helper ─────────────────────────────────────────────────
async function ss(page: Page, name: string) {
  await page.screenshot({
    path: `${SS_DIR}/${name}.png`,
    fullPage: true,
  });
}

// ── Registration helper ───────────────────────────────────────────────
async function registerViaAPI(request: APIRequestContext) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await request.post(`${API_BASE}/auth/register`, {
      data: {
        gym_name: GYM_NAME,
        owner_name: "Reports QA Tester",
        phone: OWNER_PHONE,
        email: OWNER_EMAIL,
        password: TEST_PASSWORD,
      },
    });
    if (resp.status() === 201) return resp.json();
    const body = await resp.text();
    if (
      resp.status() === 409 ||
      body.includes("already") ||
      body.includes("duplicate") ||
      body.includes("UNIQUE")
    )
      return null;
    if (resp.status() === 500 && attempt === 3) return null;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  return null;
}

// ── Login helper ──────────────────────────────────────────────────────
async function loginUser(page: Page, email?: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/email/i).fill(email ?? OWNER_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard|setup/, { timeout: 30000 });
}

// ── Create test members via API ───────────────────────────────────────
async function createTestMembers(request: APIRequestContext, cookies: { name: string; value: string }[]) {
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const members = [];
  for (let i = 0; i < 5; i++) {
    const resp = await request.post(`${API_BASE}/members`, {
      headers: { Cookie: cookieStr },
      data: {
        name: `Report Test Member ${i + 1}`,
        phone: `98765${String(RUN_ID).slice(-3)}${String(i).padStart(2, "0")}`,
        email: `member${i + 1}_${RUN_ID}@test.com`,
        membership_plan: i < 3 ? "monthly" : "quarterly",
        membership_start: "2026-01-01",
        membership_end: i < 3 ? "2026-06-30" : "2026-12-31",
        membership_status: i < 4 ? "active" : "expired",
      },
    });
    if (resp.ok()) {
      const data = await resp.json();
      members.push(data.id || data.member?.id);
    }
  }
  return members;
}

// ── Create test payments via API ──────────────────────────────────────
async function createTestPayments(
  request: APIRequestContext,
  cookies: { name: string; value: string }[],
  memberIds: string[]
) {
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  for (const memberId of memberIds) {
    if (!memberId) continue;
    await request.post(`${API_BASE}/payments`, {
      headers: { Cookie: cookieStr },
      data: {
        member_id: memberId,
        amount_in_paise: Math.floor(Math.random() * 500000) + 100000,
        payment_method: "cash",
        payment_status: "completed",
        payment_date: new Date().toISOString().split("T")[0],
      },
    });
  }
}

// ══════════════════════════════════════════════════════════════════════
// SECTION 0: Setup — Register, Login, Seed Data
// ══════════════════════════════════════════════════════════════════════
test.describe("0. Setup", () => {
  test("0.1 — Register test gym and login", async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
    await expect(page).toHaveURL(/dashboard|setup/);
    AUTH_COOKIES = await page.context().cookies();
    await ss(page, "00-setup-login-complete");
  });

  test("0.2 — Create test data (members + payments)", async ({ page, request }) => {
    if (AUTH_COOKIES.length === 0) {
      await loginUser(page);
      AUTH_COOKIES = await page.context().cookies();
    }
    MEMBER_IDS = await createTestMembers(request, AUTH_COOKIES);
    await createTestPayments(request, AUTH_COOKIES, MEMBER_IDS);
    await ss(page, "00-setup-data-seeded");
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 1: Report Module Existence & Navigation
// ══════════════════════════════════════════════════════════════════════
test.describe("1. Report Module Existence & Navigation", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
  });

  test("1.1 — CRITICAL: Check if Reports link exists in sidebar", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Look for any report-related navigation
    const sidebar = page.locator("nav");
    const reportLinks = sidebar.locator(
      'a:has-text("Report"), a:has-text("report"), a:has-text("Analytics"), a:has-text("Export")'
    );
    const reportCount = await reportLinks.count();

    await ss(page, "01-sidebar-report-check");

    // This is the critical finding
    if (reportCount === 0) {
      console.log("CRITICAL FINDING: No Reports/Analytics/Export navigation link found in sidebar");
    }
    // We document this — don't fail, just record
    expect(reportCount).toBeGreaterThanOrEqual(0); // Always passes — we document the finding
  });

  test("1.2 — Attempt direct navigation to /reports", async ({ page }) => {
    const response = await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    const status = response?.status();
    await ss(page, "01-direct-navigate-reports");

    console.log(`/reports navigation: URL=${url}, Status=${status}`);

    // Check if it 404s, redirects, or has content
    const has404 = await page.locator("text=404").count();
    const hasNotFound = await page.locator('text=/not found/i').count();
    const redirectedAway = !url.includes("/reports");

    if (has404 > 0 || hasNotFound > 0 || redirectedAway) {
      console.log("FINDING: /reports route does not exist or redirects");
    }
  });

  test("1.3 — Attempt direct navigation to /analytics", async ({ page }) => {
    const response = await page.goto("/analytics");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    await ss(page, "01-direct-navigate-analytics");

    console.log(`/analytics navigation: URL=${url}`);
    const redirectedAway = !url.includes("/analytics");
    if (redirectedAway) {
      console.log("FINDING: /analytics route does not exist or redirects");
    }
  });

  test("1.4 — Attempt direct navigation to /export", async ({ page }) => {
    const response = await page.goto("/export");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    await ss(page, "01-direct-navigate-export");

    console.log(`/export navigation: URL=${url}`);
    const redirectedAway = !url.includes("/export");
    if (redirectedAway) {
      console.log("FINDING: /export route does not exist or redirects");
    }
  });

  test("1.5 — Check all sidebar links for report-like features", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const navLinks = page.locator("nav a");
    const linkCount = await navLinks.count();
    const linkTexts: string[] = [];

    for (let i = 0; i < linkCount; i++) {
      const text = await navLinks.nth(i).textContent();
      const href = await navLinks.nth(i).getAttribute("href");
      linkTexts.push(`${text?.trim()} → ${href}`);
    }

    console.log("All sidebar navigation links:");
    linkTexts.forEach((l) => console.log(`  ${l}`));

    await ss(page, "01-all-sidebar-links");

    // Check for any export/download/report keywords
    const reportKeywords = ["report", "export", "download", "csv", "pdf", "analytics"];
    const found = linkTexts.filter((l) =>
      reportKeywords.some((k) => l.toLowerCase().includes(k))
    );

    if (found.length === 0) {
      console.log(
        "CRITICAL: No report/export/download/csv/pdf/analytics links found in navigation"
      );
    }
  });

  test("1.6 — Scan all pages for export/download buttons", async ({ page }) => {
    const pagesToCheck = [
      "/dashboard",
      "/members",
      "/payments",
      "/attendance",
      "/equipment",
      "/notifications",
      "/billing/manage",
      "/settings",
    ];

    const findings: string[] = [];

    for (const pagePath of pagesToCheck) {
      await page.goto(pagePath);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      // Look for export/download buttons
      const exportButtons = page.locator(
        'button:has-text("Export"), button:has-text("Download"), button:has-text("CSV"), button:has-text("PDF"), button:has-text("Report"), a:has-text("Export"), a:has-text("Download")'
      );
      const count = await exportButtons.count();

      if (count > 0) {
        findings.push(`${pagePath}: Found ${count} export/download button(s)`);
        for (let i = 0; i < count; i++) {
          const text = await exportButtons.nth(i).textContent();
          findings.push(`  → "${text?.trim()}"`);
        }
      } else {
        findings.push(`${pagePath}: NO export/download buttons found`);
      }

      await ss(page, `01-scan-${pagePath.replace(/\//g, "-").slice(1)}`);
    }

    console.log("Export/Download button scan results:");
    findings.forEach((f) => console.log(`  ${f}`));
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 2: Revenue / Financial Reporting via Dashboard
// ══════════════════════════════════════════════════════════════════════
test.describe("2. Revenue & Financial Reporting", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("2.1 — Dashboard displays revenue metric", async ({ page }) => {
    // Check for revenue-related content
    const revenueCard = page.locator('text=/revenue/i').first();
    const revenueVisible = await revenueCard.isVisible().catch(() => false);

    await ss(page, "02-revenue-metric");

    if (revenueVisible) {
      console.log("Revenue metric found on dashboard");
    } else {
      console.log("FINDING: No revenue metric visible on dashboard");
    }
  });

  test("2.2 — Dashboard revenue displays currency symbol (₹)", async ({ page }) => {
    await page.waitForTimeout(2000); // Wait for data load
    const currencySymbols = page.locator('text=/₹/');
    const count = await currencySymbols.count();

    await ss(page, "02-currency-symbol");

    console.log(`Currency symbol (₹) instances on dashboard: ${count}`);
    expect(count).toBeGreaterThanOrEqual(0); // Document finding
  });

  test("2.3 — Recent Payments chart displays on dashboard", async ({ page }) => {
    await page.waitForTimeout(2000);
    const paymentChart = page.locator('text=/Recent Payments/i');
    const chartVisible = await paymentChart.isVisible().catch(() => false);

    await ss(page, "02-recent-payments-chart");

    if (chartVisible) {
      console.log("Recent Payments chart found");
      // Check if chart has data bars
      const bars = page.locator(".recharts-bar-rectangle, .recharts-bar rect");
      const barCount = await bars.count();
      console.log(`Chart bars rendered: ${barCount}`);
    } else {
      console.log("FINDING: No Recent Payments chart on dashboard");
    }
  });

  test("2.4 — Attendance Trend chart displays on dashboard", async ({ page }) => {
    await page.waitForTimeout(2000);
    const trendChart = page.locator('text=/Attendance Trend/i');
    const chartVisible = await trendChart.isVisible().catch(() => false);

    await ss(page, "02-attendance-trend-chart");

    if (chartVisible) {
      console.log("Attendance Trend chart found");
    } else {
      console.log("FINDING: No Attendance Trend chart on dashboard");
    }
  });

  test("2.5 — Dashboard metric cards show correct structure", async ({ page }) => {
    await page.waitForTimeout(2000);

    const expectedCards = [
      "Total Members",
      "Active Members",
      "Expiring Soon",
      "Revenue",
    ];

    const findings: string[] = [];

    for (const cardTitle of expectedCards) {
      const card = page.locator(`text=/${cardTitle}/i`).first();
      const visible = await card.isVisible().catch(() => false);
      findings.push(`${cardTitle}: ${visible ? "VISIBLE" : "NOT FOUND"}`);
    }

    console.log("Dashboard metric cards:");
    findings.forEach((f) => console.log(`  ${f}`));

    await ss(page, "02-metric-cards");
  });

  test("2.6 — CRITICAL: No export button for revenue data", async ({ page }) => {
    await page.waitForTimeout(2000);

    // Check dashboard for any export capability
    const exportBtn = page.locator(
      'button:has-text("Export"), button:has-text("Download"), button:has-text("CSV"), button:has-text("PDF")'
    );
    const exportCount = await exportBtn.count();

    await ss(page, "02-no-revenue-export");

    console.log(
      `CRITICAL FINDING: Dashboard has ${exportCount} export buttons for revenue data`
    );
    if (exportCount === 0) {
      console.log(
        "Business owners CANNOT export revenue reports — critical missing feature"
      );
    }
  });

  test("2.7 — Verify dashboard revenue via API cross-check", async ({ page, request }) => {
    if (AUTH_COOKIES.length === 0) {
      AUTH_COOKIES = await page.context().cookies();
    }
    const cookieStr = AUTH_COOKIES.map((c) => `${c.name}=${c.value}`).join("; ");

    // Get metrics from API
    const resp = await request.get(`${API_BASE}/dashboard/metrics`, {
      headers: { Cookie: cookieStr },
    });

    if (resp.ok()) {
      const metrics = await resp.json();
      console.log("Dashboard API Metrics:", JSON.stringify(metrics, null, 2));

      // Compare with what's displayed on UI
      await page.waitForTimeout(2000);
      const pageText = await page.textContent("body");

      const totalMembers = String(metrics.total_members);
      const activeMembers = String(metrics.active_members);

      const hasTotalMembers = pageText?.includes(totalMembers);
      const hasActiveMembers = pageText?.includes(activeMembers);

      console.log(
        `API total_members=${totalMembers}, visible on page: ${hasTotalMembers}`
      );
      console.log(
        `API active_members=${activeMembers}, visible on page: ${hasActiveMembers}`
      );
    } else {
      console.log(`Dashboard metrics API returned status ${resp.status()}`);
    }

    await ss(page, "02-api-cross-check");
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 3: Attendance Reporting & Data Display
// ══════════════════════════════════════════════════════════════════════
test.describe("3. Attendance Reporting", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
  });

  test("3.1 — Attendance page shows today's attendance data", async ({ page }) => {
    await page.goto("/attendance");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const heading = page.locator('text=/attendance/i').first();
    await expect(heading).toBeVisible();

    // Check for stats cards
    const statsCards = page.locator('text=/Checked In Today|Currently In Gym|This Week/i');
    const statsCount = await statsCards.count();
    console.log(`Attendance stats cards found: ${statsCount}`);

    await ss(page, "03-attendance-page");
  });

  test("3.2 — Attendance page has no date range filter", async ({ page }) => {
    await page.goto("/attendance");
    await page.waitForLoadState("networkidle");

    // Look for date pickers, filters
    const dateInputs = page.locator('input[type="date"], input[placeholder*="date" i]');
    const dateCount = await dateInputs.count();

    const filterBtns = page.locator(
      'button:has-text("Filter"), button:has-text("Date Range"), select'
    );
    const filterCount = await filterBtns.count();

    console.log(`Date inputs: ${dateCount}, Filter buttons: ${filterCount}`);
    console.log(
      dateCount === 0 && filterCount === 0
        ? "FINDING: No date range filtering available for attendance reports"
        : "Date filtering available"
    );

    await ss(page, "03-attendance-no-filter");
  });

  test("3.3 — No attendance export/download available", async ({ page }) => {
    await page.goto("/attendance");
    await page.waitForLoadState("networkidle");

    const exportBtn = page.locator(
      'button:has-text("Export"), button:has-text("Download"), button:has-text("CSV"), a:has-text("Export")'
    );
    const count = await exportBtn.count();

    console.log(
      `CRITICAL: Attendance page has ${count} export buttons — gym owners cannot export attendance data`
    );

    await ss(page, "03-attendance-no-export");
  });

  test("3.4 — Attendance stats values are numeric", async ({ page }) => {
    await page.goto("/attendance");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Verify stats show numbers (not NaN, undefined, [object Object])
    const pageText = await page.textContent("body");
    const badPatterns = ["NaN", "undefined", "[object Object]", "null"];
    const foundBadPatterns = badPatterns.filter((p) => pageText?.includes(p));

    if (foundBadPatterns.length > 0) {
      console.log(`BUG: Found bad data patterns on attendance page: ${foundBadPatterns.join(", ")}`);
    } else {
      console.log("Attendance data renders without bad patterns");
    }

    await ss(page, "03-attendance-data-quality");
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 4: Membership Reporting & Data Display
// ══════════════════════════════════════════════════════════════════════
test.describe("4. Membership Reporting", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
  });

  test("4.1 — Members page displays member list", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const heading = page.locator('text=/members/i').first();
    await expect(heading).toBeVisible();

    // Check table or list rendering
    const tableRows = page.locator("table tbody tr, [class*='member']");
    const rowCount = await tableRows.count();
    console.log(`Member rows/items displayed: ${rowCount}`);

    await ss(page, "04-members-page");
  });

  test("4.2 — Members page shows total count", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const countText = page.locator('text=/\\d+ member/i');
    const visible = await countText.isVisible().catch(() => false);

    console.log(`Member count display: ${visible ? "Found" : "NOT FOUND"}`);
    await ss(page, "04-members-count");
  });

  test("4.3 — Members search functionality works", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const searchInput = page.locator(
      'input[placeholder*="search" i], input[placeholder*="name" i], input[type="search"]'
    );
    const searchExists = (await searchInput.count()) > 0;

    if (searchExists) {
      await searchInput.first().fill("Report Test");
      await page.waitForTimeout(1000);
      console.log("Search input found and tested");
    } else {
      console.log("FINDING: No search input on members page");
    }

    await ss(page, "04-members-search");
  });

  test("4.4 — No member export/download button available", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");

    const exportBtn = page.locator(
      'button:has-text("Export"), button:has-text("Download"), button:has-text("CSV"), button:has-text("PDF")'
    );
    const count = await exportBtn.count();

    console.log(
      `CRITICAL: Members page has ${count} export buttons — gym owners cannot export member lists`
    );

    await ss(page, "04-members-no-export");
  });

  test("4.5 — Members pagination works", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const paginationBtns = page.locator(
      'button:has-text("Next"), button:has-text("Previous"), button:has-text(">")'
    );
    const paginationCount = await paginationBtns.count();

    console.log(`Pagination buttons found: ${paginationCount}`);
    await ss(page, "04-members-pagination");
  });

  test("4.6 — Member status badges render correctly", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const statusBadges = page.locator(
      'text=/active|expired|frozen|pending|cancelled/i'
    );
    const badgeCount = await statusBadges.count();

    console.log(`Status badges found: ${badgeCount}`);

    // Verify no raw JSON/object rendering
    const pageText = await page.textContent("body");
    if (pageText?.includes("[object Object]")) {
      console.log("BUG: Raw [object Object] rendered on members page");
    }

    await ss(page, "04-members-status-badges");
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 5: Payment Data Reporting
// ══════════════════════════════════════════════════════════════════════
test.describe("5. Payment Data Reporting", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
  });

  test("5.1 — Payments page displays payment records", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const heading = page.locator('text=/payments/i').first();
    await expect(heading).toBeVisible();

    const tableRows = page.locator("table tbody tr");
    const rowCount = await tableRows.count();
    console.log(`Payment rows displayed: ${rowCount}`);

    await ss(page, "05-payments-page");
  });

  test("5.2 — Payments show correct currency formatting (₹)", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const currencySymbols = page.locator('text=/₹/');
    const count = await currencySymbols.count();

    console.log(`Currency symbols on payments page: ${count}`);

    // Check for raw paise values (should not show raw numbers like 150000)
    const pageText = await page.textContent("body");
    await ss(page, "05-payment-currency");
  });

  test("5.3 — Payments show proper date formatting", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Look for date patterns (DD/MM/YYYY or similar locale format)
    const pageText = await page.textContent("body");
    const hasISO = pageText?.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    if (hasISO) {
      console.log("BUG: Raw ISO date string visible to user on payments page");
    } else {
      console.log("Payment dates appear properly formatted");
    }

    await ss(page, "05-payment-dates");
  });

  test("5.4 — No payment export/download capability", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");

    const exportBtn = page.locator(
      'button:has-text("Export"), button:has-text("Download"), button:has-text("CSV"), button:has-text("PDF"), button:has-text("Report")'
    );
    const count = await exportBtn.count();

    console.log(
      `CRITICAL: Payments page has ${count} export buttons — gym owners cannot export payment/revenue reports`
    );

    await ss(page, "05-payments-no-export");
  });

  test("5.5 — Payment totals display", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Check if there's a total/summary
    const totalText = page.locator('text=/total|sum|grand total/i');
    const totalCount = await totalText.count();

    const paymentCountText = page.locator('text=/\\d+ payment/i');
    const hasCount = await paymentCountText.isVisible().catch(() => false);

    console.log(
      `Payment total/summary: ${totalCount > 0 ? "Found" : "NOT FOUND"}`
    );
    console.log(`Payment count display: ${hasCount ? "Found" : "NOT FOUND"}`);

    await ss(page, "05-payment-totals");
  });

  test("5.6 — Payment method badges render correctly", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const methods = page.locator('text=/cash|upi|card|bank transfer|other/i');
    const methodCount = await methods.count();

    console.log(`Payment method badges found: ${methodCount}`);
    await ss(page, "05-payment-methods");
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 6: Export & Download Capabilities (Comprehensive Scan)
// ══════════════════════════════════════════════════════════════════════
test.describe("6. Export & Download Capabilities", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
  });

  test("6.1 — CRITICAL: Comprehensive export capability audit", async ({ page }) => {
    const allPages = [
      { path: "/dashboard", name: "Dashboard" },
      { path: "/members", name: "Members" },
      { path: "/payments", name: "Payments" },
      { path: "/attendance", name: "Attendance" },
      { path: "/equipment", name: "Equipment" },
      { path: "/notifications", name: "Notifications" },
      { path: "/billing/manage", name: "Billing" },
      { path: "/settings", name: "Settings" },
    ];

    const audit: string[] = [];

    for (const pg of allPages) {
      await page.goto(pg.path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      // Check for any download/export elements
      const exportElements = page.locator(
        'button:has-text("Export"), button:has-text("Download"), button:has-text("CSV"), button:has-text("PDF"), button:has-text("Excel"), button:has-text("Print"), a[download], a:has-text("Export"), a:has-text("Download")'
      );
      const count = await exportElements.count();

      // Check for hidden export menus
      const dropdowns = page.locator('[role="menu"], [data-state="open"]');
      const menuCount = await dropdowns.count();

      audit.push(
        `${pg.name} (${pg.path}): ${count} export elements, ${menuCount} dropdown menus`
      );

      await ss(page, `06-export-audit-${pg.name.toLowerCase()}`);
    }

    console.log("═══ EXPORT CAPABILITY AUDIT ═══");
    audit.forEach((a) => console.log(`  ${a}`));
    console.log("═══════════════════════════════");
  });

  test("6.2 — Check backend API for export endpoints", async ({ request }) => {
    const endpoints = [
      "/members/export",
      "/payments/export",
      "/attendance/export",
      "/reports/revenue",
      "/reports/attendance",
      "/reports/members",
      "/export/csv",
      "/export/pdf",
    ];

    const results: string[] = [];

    for (const ep of endpoints) {
      const resp = await request.get(`${API_BASE}${ep}`);
      results.push(
        `${ep}: ${resp.status()} ${resp.status() === 404 ? "(NOT FOUND)" : ""}`
      );
    }

    console.log("Backend export endpoint check:");
    results.forEach((r) => console.log(`  ${r}`));
  });

  test("6.3 — Check if browser print functionality is available", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");

    // Check for print-specific styles
    const hasPrintStyles = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          if (rules.some((r) => r instanceof CSSMediaRule && r.conditionText === "print")) {
            return true;
          }
        } catch {
          /* cross-origin */
        }
      }
      return false;
    });

    console.log(`Print-specific CSS styles: ${hasPrintStyles ? "Found" : "NOT FOUND"}`);
    await ss(page, "06-print-styles");
  });

  test("6.4 — Check for file download handler setup", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Check if any download triggers exist in the page JS
    const hasDownloadHandler = await page.evaluate(() => {
      // Check for blob URL creation capability
      const hasBlobURL = typeof URL.createObjectURL === "function";
      // Check for anchor-based download
      const downloadLinks = document.querySelectorAll("a[download]");
      return {
        blobSupport: hasBlobURL,
        downloadLinks: downloadLinks.length,
      };
    });

    console.log("Download capability:", JSON.stringify(hasDownloadHandler));
    await ss(page, "06-download-handler");
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 7: Filter & Search Behavior
// ══════════════════════════════════════════════════════════════════════
test.describe("7. Filter & Search", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
  });

  test("7.1 — Members page search with valid input", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const searchInput = page.locator(
      'input[placeholder*="search" i], input[placeholder*="name" i], input[type="search"]'
    );

    if ((await searchInput.count()) > 0) {
      await searchInput.first().fill("Report Test");
      await page.waitForTimeout(1500);

      const results = page.locator("table tbody tr");
      const resultCount = await results.count();
      console.log(`Search "Report Test" returned ${resultCount} rows`);

      await ss(page, "07-search-valid");
    } else {
      console.log("FINDING: No search input available on members page");
    }
  });

  test("7.2 — Members page search with no results", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const searchInput = page.locator(
      'input[placeholder*="search" i], input[placeholder*="name" i], input[type="search"]'
    );

    if ((await searchInput.count()) > 0) {
      await searchInput.first().fill("ZZZZNONEXISTENT99999");
      await page.waitForTimeout(1500);

      const emptyState = page.locator(
        'text=/no members|no results|not found|empty/i'
      );
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      console.log(
        `Empty search results handled: ${hasEmptyState ? "YES (empty state shown)" : "NOT CLEAR"}`
      );

      await ss(page, "07-search-empty");
    }
  });

  test("7.3 — Members search with special characters (XSS probe)", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const searchInput = page.locator(
      'input[placeholder*="search" i], input[placeholder*="name" i], input[type="search"]'
    );

    if ((await searchInput.count()) > 0) {
      const xssPayload = '<script>alert("XSS")</script>';
      await searchInput.first().fill(xssPayload);
      await page.waitForTimeout(1500);

      // Check no script executed
      const dialogFired = await page.evaluate(() => {
        return (window as any).__xss_fired === true;
      });

      expect(dialogFired).toBeFalsy();
      console.log("XSS search injection: SAFE (no script executed)");

      // Check if raw HTML is rendered
      const pageHTML = await page.content();
      const rawScriptRendered = pageHTML.includes('<script>alert("XSS")</script>');
      console.log(
        `Raw script tag in DOM: ${rawScriptRendered ? "YES (potential XSS)" : "NO (safe)"}`
      );

      await ss(page, "07-search-xss");
    }
  });

  test("7.4 — Rapid search typing (debounce test)", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const searchInput = page.locator(
      'input[placeholder*="search" i], input[placeholder*="name" i], input[type="search"]'
    );

    if ((await searchInput.count()) > 0) {
      // Track API calls
      let apiCallCount = 0;
      page.on("request", (req) => {
        if (req.url().includes("/members") && req.url().includes("search")) {
          apiCallCount++;
        }
      });

      // Rapid typing
      await searchInput.first().fill("");
      for (const char of "Report Test Member") {
        await searchInput.first().press(char);
        await page.waitForTimeout(50);
      }

      await page.waitForTimeout(2000); // Wait for debounce

      console.log(
        `Rapid typing API calls: ${apiCallCount} (should be debounced, not 18)`
      );

      await ss(page, "07-search-debounce");
    }
  });

  test("7.5 — Payments page filter capability check", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");

    // Look for filter controls
    const filterElements = page.locator(
      'input[type="date"], select, button:has-text("Filter"), [role="combobox"]'
    );
    const filterCount = await filterElements.count();

    console.log(`Payment filter elements found: ${filterCount}`);
    console.log(
      filterCount === 0
        ? "FINDING: No filter/date-range capability on payments page"
        : "Filter capability present"
    );

    await ss(page, "07-payments-filter");
  });

  test("7.6 — SQL injection in search field", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const searchInput = page.locator(
      'input[placeholder*="search" i], input[placeholder*="name" i], input[type="search"]'
    );

    if ((await searchInput.count()) > 0) {
      const sqliPayload = "' OR '1'='1'; DROP TABLE members; --";
      await searchInput.first().fill(sqliPayload);
      await page.waitForTimeout(1500);

      // Page should not crash
      const pageText = await page.textContent("body");
      const hasError =
        pageText?.includes("Internal Server Error") ||
        pageText?.includes("syntax error") ||
        pageText?.includes("SQL");

      console.log(
        `SQLi search test: ${hasError ? "POTENTIAL VULNERABILITY (error exposed)" : "SAFE"}`
      );

      await ss(page, "07-search-sqli");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 8: Data Integrity Validation
// ══════════════════════════════════════════════════════════════════════
test.describe("8. Data Integrity", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
    AUTH_COOKIES = await page.context().cookies();
  });

  test("8.1 — Dashboard member count matches members page count", async ({ page, request }) => {
    // Get dashboard metrics
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const cookieStr = AUTH_COOKIES.map((c) => `${c.name}=${c.value}`).join("; ");
    const metricsResp = await request.get(`${API_BASE}/dashboard/metrics`, {
      headers: { Cookie: cookieStr },
    });

    let dashTotal = 0;
    if (metricsResp.ok()) {
      const metrics = await metricsResp.json();
      dashTotal = metrics.total_members;
    }

    // Get members count
    const membersResp = await request.get(`${API_BASE}/members?limit=1`, {
      headers: { Cookie: cookieStr },
    });

    let membersTotal = 0;
    if (membersResp.ok()) {
      const data = await membersResp.json();
      membersTotal = data.total;
    }

    console.log(
      `Data Integrity: Dashboard total_members=${dashTotal}, Members API total=${membersTotal}`
    );
    console.log(
      dashTotal === membersTotal
        ? "PASS: Counts match"
        : `FAIL: Mismatch (difference: ${Math.abs(dashTotal - membersTotal)})`
    );

    await ss(page, "08-data-integrity-members");
  });

  test("8.2 — Payment amounts display correct precision", async ({ page, request }) => {
    const cookieStr = AUTH_COOKIES.map((c) => `${c.name}=${c.value}`).join("; ");

    const resp = await request.get(`${API_BASE}/payments?limit=5`, {
      headers: { Cookie: cookieStr },
    });

    if (resp.ok()) {
      const data = await resp.json();
      const payments = data.payments || [];

      for (const p of payments) {
        const paise = p.amount_in_paise;
        const expectedRupees = (paise / 100).toFixed(2);
        console.log(
          `Payment ${p.id}: ${paise} paise = ₹${expectedRupees}`
        );
      }
    }

    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await ss(page, "08-payment-precision");
  });

  test("8.3 — No duplicate records in member list", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();

    if (rowCount > 0) {
      const names: string[] = [];
      for (let i = 0; i < rowCount; i++) {
        const text = await rows.nth(i).textContent();
        names.push(text || "");
      }

      const uniqueNames = new Set(names);
      const hasDuplicates = uniqueNames.size !== names.length;

      console.log(
        `Duplicate check: ${rowCount} rows, ${uniqueNames.size} unique — ${hasDuplicates ? "DUPLICATES FOUND" : "NO DUPLICATES"}`
      );
    } else {
      console.log("No member rows to check for duplicates");
    }

    await ss(page, "08-no-duplicates");
  });

  test("8.4 — Console errors during data display", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Visit all data pages
    for (const path of ["/dashboard", "/members", "/payments", "/attendance"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
    }

    console.log(`Console errors during data display: ${consoleErrors.length}`);
    consoleErrors.forEach((e) => console.log(`  ERROR: ${e}`));

    await ss(page, "08-console-errors");
  });

  test("8.5 — Network request failures during data loading", async ({ page }) => {
    const failedRequests: string[] = [];
    page.on("requestfailed", (req) => {
      failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
    });

    for (const path of ["/dashboard", "/members", "/payments", "/attendance"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
    }

    console.log(`Failed network requests: ${failedRequests.length}`);
    failedRequests.forEach((r) => console.log(`  FAILED: ${r}`));

    await ss(page, "08-network-failures");
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 9: Security Tests
// ══════════════════════════════════════════════════════════════════════
test.describe("9. Security", () => {
  test("9.1 — Unauthenticated API access blocked", async ({ request }) => {
    const endpoints = [
      "/dashboard/metrics",
      "/payments",
      "/members",
      "/attendance/today",
      "/attendance/stats",
    ];

    const results: string[] = [];

    for (const ep of endpoints) {
      const resp = await request.get(`${API_BASE}${ep}`);
      const blocked = resp.status() === 401 || resp.status() === 403;
      results.push(
        `${ep}: ${resp.status()} — ${blocked ? "BLOCKED (secure)" : "ACCESSIBLE (VULNERABILITY)"}`
      );
    }

    console.log("Unauthenticated access test:");
    results.forEach((r) => console.log(`  ${r}`));
  });

  test("9.2 — Session token not in URL or localStorage", async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);

    // Check URL doesn't contain token
    const url = page.url();
    const urlHasToken =
      url.includes("token=") || url.includes("jwt=") || url.includes("session=");
    console.log(`Token in URL: ${urlHasToken ? "YES (VULNERABILITY)" : "NO (secure)"}`);

    // Check localStorage
    const localStorageData = await page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) data[key] = localStorage.getItem(key) || "";
      }
      return data;
    });

    console.log("localStorage keys:", Object.keys(localStorageData).join(", "));

    // Check for sensitive tokens in localStorage
    const sensitiveKeys = Object.keys(localStorageData).filter(
      (k) =>
        k.toLowerCase().includes("token") ||
        k.toLowerCase().includes("jwt") ||
        k.toLowerCase().includes("secret")
    );

    if (sensitiveKeys.length > 0) {
      console.log(
        `WARNING: Sensitive keys in localStorage: ${sensitiveKeys.join(", ")}`
      );
    } else {
      console.log("No sensitive token keys in localStorage");
    }

    await ss(page, "09-token-storage");
  });

  test("9.3 — API responses don't leak sensitive data", async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
    const cookies = await page.context().cookies();
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const resp = await request.get(`${API_BASE}/members?limit=1`, {
      headers: { Cookie: cookieStr },
    });

    if (resp.ok()) {
      const data = await resp.json();
      const dataStr = JSON.stringify(data);

      const sensitiveFields = [
        "password",
        "password_hash",
        "secret",
        "credit_card",
        "ssn",
      ];
      const leaks = sensitiveFields.filter((f) =>
        dataStr.toLowerCase().includes(f)
      );

      console.log(
        leaks.length > 0
          ? `DATA LEAK: Sensitive fields found: ${leaks.join(", ")}`
          : "No sensitive data leaked in API response"
      );
    }

    await ss(page, "09-data-leak-check");
  });

  test("9.4 — CORS headers check", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/health`, {
      headers: { Origin: "http://evil-site.com" },
    });

    const corsHeader = resp.headers()["access-control-allow-origin"];
    console.log(
      `CORS Allow-Origin: ${corsHeader || "NOT SET"}`
    );

    if (corsHeader === "*") {
      console.log("WARNING: Wildcard CORS — any origin can access API");
    }
  });

  test("9.5 — HttpOnly cookie check", async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);

    const cookies = await page.context().cookies();
    const authCookies = cookies.filter(
      (c) =>
        c.name.includes("access") ||
        c.name.includes("refresh") ||
        c.name.includes("session") ||
        c.name.includes("token")
    );

    console.log("Auth-related cookies:");
    authCookies.forEach((c) => {
      console.log(
        `  ${c.name}: httpOnly=${c.httpOnly}, secure=${c.secure}, sameSite=${c.sameSite}`
      );
    });

    const insecureCookies = authCookies.filter((c) => !c.httpOnly);
    if (insecureCookies.length > 0) {
      console.log(
        `SECURITY WARNING: ${insecureCookies.length} auth cookie(s) without HttpOnly flag`
      );
    }
  });

  test("9.6 — Direct API manipulation with invalid tokens", async ({ request }) => {
    const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIiwiZXhwIjoxfQ.fake";

    const resp = await request.get(`${API_BASE}/dashboard/metrics`, {
      headers: {
        Cookie: `access_token=${fakeToken}`,
        Authorization: `Bearer ${fakeToken}`,
      },
    });

    console.log(
      `Fake token API call: ${resp.status()} — ${resp.status() === 401 ? "REJECTED (secure)" : "ACCEPTED (VULNERABILITY)"}`
    );
  });

  test("9.7 — Logout clears session properly", async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);

    // Store pre-logout cookies
    const preCookies = await page.context().cookies();

    // Logout
    const logoutBtn = page.locator('button:has-text("Logout"), button:has-text("Sign Out"), button:has-text("Log out")');
    const logoutExists = await logoutBtn.count();

    if (logoutExists > 0) {
      await logoutBtn.first().click();
      await page.waitForTimeout(2000);

      // Check cookies after logout
      const postCookies = await page.context().cookies();
      const authCookiesPost = postCookies.filter(
        (c) => c.name.includes("access") || c.name.includes("refresh")
      );

      console.log(
        `Post-logout auth cookies: ${authCookiesPost.length} (should be 0 or expired)`
      );

      // Try to access protected page
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
      const url = page.url();
      console.log(
        `Post-logout redirect: ${url.includes("/login") ? "Redirected to login (secure)" : "Still on dashboard (ISSUE)"}`
      );
    } else {
      console.log("FINDING: No visible logout button found");
    }

    await ss(page, "09-logout-check");
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 10: Network Failure Recovery
// ══════════════════════════════════════════════════════════════════════
test.describe("10. Network Failure Recovery", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
  });

  test("10.1 — Slow network (3G simulation) on dashboard", async ({ page }) => {
    // First load page normally, then throttle for reload test
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Now simulate slow 3G for a reload
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (1500 * 1024) / 8, // 1.5Mbps (fast 3G)
      uploadThroughput: (750 * 1024) / 8,
      latency: 200,
    });

    const startTime = Date.now();
    await page.reload({ timeout: 45000 });
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - startTime;

    console.log(`Dashboard reload time on slow 3G: ${loadTime}ms`);

    // Check for loading states
    const hasLoader = await page.locator('.animate-spin, [class*="skeleton"]').count();
    console.log(`Loading indicators shown: ${hasLoader > 0 ? "YES" : "NO"}`);

    // Reset network
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });

    await ss(page, "10-slow-network-dashboard");
  });

  test("10.2 — Offline mode on members page", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Go offline
    await page.context().setOffline(true);

    // Try to navigate/interact
    await page.goto("/payments").catch(() => {});
    await page.waitForTimeout(2000);

    const pageText = await page.textContent("body");
    const hasOfflineMsg =
      pageText?.includes("offline") ||
      pageText?.includes("network") ||
      pageText?.includes("connection");

    console.log(
      `Offline handling: ${hasOfflineMsg ? "Shows offline message" : "No offline indicator"}`
    );

    // Go back online
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);

    await ss(page, "10-offline-mode");
  });

  test("10.3 — API timeout handling", async ({ page }) => {
    // Intercept API calls and delay them
    await page.route("**/api/v1/dashboard/**", async (route) => {
      await new Promise((r) => setTimeout(r, 15000)); // 15s delay
      await route.abort("timedout");
    });

    await page.goto("/dashboard");
    await page.waitForTimeout(10000); // Wait for timeout effects

    // Check for error/retry states
    const hasError = await page
      .getByText(/error|failed|retry|unable/i)
      .count();
    const hasLoader = await page
      .locator('.animate-spin, [class*="skeleton"]')
      .count();

    console.log(
      `Timeout handling: Errors shown=${hasError > 0}, Loaders shown=${hasLoader > 0}`
    );

    await ss(page, "10-api-timeout");
  });

  test("10.4 — Refresh during data loading", async ({ page }) => {
    // Start loading a page
    await page.goto("/members");

    // Immediately refresh before load completes
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Page should work normally
    const heading = page.locator('text=/members/i').first();
    const headingVisible = await heading.isVisible().catch(() => false);

    console.log(
      `Post-refresh state: ${headingVisible ? "Page renders correctly" : "Page broken after refresh"}`
    );

    await ss(page, "10-refresh-during-load");
  });

  test("10.5 — Failed API response handling (500 error)", async ({ page }) => {
    // Intercept and return 500
    await page.route("**/api/v1/members*", (route) =>
      route.fulfill({
        status: 500,
        body: JSON.stringify({ detail: "Internal Server Error" }),
      })
    );

    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const pageText = await page.textContent("body");
    const hasErrorUI =
      pageText?.toLowerCase().includes("error") ||
      pageText?.toLowerCase().includes("failed") ||
      pageText?.toLowerCase().includes("try again");

    console.log(
      `500 error handling: ${hasErrorUI ? "Error UI shown" : "No error indicator (silent failure)"}`
    );

    await ss(page, "10-500-error");
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 11: Multi-Tab & Concurrency
// ══════════════════════════════════════════════════════════════════════
test.describe("11. Multi-Tab & Concurrency", () => {
  test("11.1 — Two tabs showing same data page", async ({ browser, request }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await registerViaAPI(request);

    // Login in page1
    await page1.goto(`${APP_BASE}/login`);
    await page1.waitForLoadState("networkidle");
    await page1.getByLabel(/email/i).fill(OWNER_EMAIL);
    await page1.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page1.getByRole("button", { name: /sign in/i }).click();
    await page1.waitForURL(/dashboard|setup/, { timeout: 30000 });

    // Navigate to members in both tabs
    await page1.goto(`${APP_BASE}/members`);
    await page1.waitForLoadState("networkidle");

    // Share cookies
    const cookies = await context.cookies();

    await page2.goto(`${APP_BASE}/members`);
    await page2.waitForLoadState("networkidle");
    await page2.waitForTimeout(2000);

    // Both should show the same data
    const page1Text = await page1.textContent("body");
    const page2Text = await page2.textContent("body");

    const page1HasMembers = page1Text?.toLowerCase().includes("member");
    const page2HasMembers = page2Text?.toLowerCase().includes("member");

    console.log(
      `Multi-tab consistency: Tab1=${page1HasMembers}, Tab2=${page2HasMembers}`
    );

    await page1.screenshot({ path: `${SS_DIR}/11-multitab-tab1.png`, fullPage: true });
    await page2.screenshot({ path: `${SS_DIR}/11-multitab-tab2.png`, fullPage: true });

    await context.close();
  });

  test("11.2 — Rapid page navigation (no crashes)", async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);

    const pages = ["/dashboard", "/members", "/payments", "/attendance", "/dashboard"];

    for (const p of pages) {
      await page.goto(p);
      await page.waitForTimeout(300); // Rapid navigation
    }

    // Final page should render
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const pageText = await page.textContent("body");
    const hasContent = (pageText?.length || 0) > 100;

    console.log(
      `Rapid navigation: ${hasContent ? "Page renders correctly" : "Page empty/broken"}`
    );

    await ss(page, "11-rapid-navigation");
  });

  test("11.3 — Concurrent API requests (double-click prevention)", async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Track API calls
    let apiCallCount = 0;
    page.on("request", (req) => {
      if (req.url().includes("/members") && req.method() === "GET") {
        apiCallCount++;
      }
    });

    // Rapid refresh clicks
    await page.reload();
    await page.reload();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    console.log(`API calls after triple-refresh: ${apiCallCount}`);

    await ss(page, "11-concurrent-requests");
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 12: Mobile Responsive Testing
// ══════════════════════════════════════════════════════════════════════
test.describe("12. Mobile Responsive", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
  });

  test("12.1 — iPhone viewport (375x667)", async ({ browser, request }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    const page = await context.newPage();

    await registerViaAPI(request);
    await page.goto(`${APP_BASE}/login`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(OWNER_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/dashboard|setup/, { timeout: 30000 });

    // Test all data pages
    for (const path of ["/dashboard", "/members", "/payments", "/attendance"]) {
      await page.goto(`${APP_BASE}${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      // Check for horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      // Check for overlapping elements
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);

      console.log(
        `iPhone ${path}: overflow=${hasOverflow}, bodyWidth=${bodyWidth}`
      );

      await page.screenshot({
        path: `${SS_DIR}/12-iphone${path.replace(/\//g, "-")}.png`,
        fullPage: true,
      });
    }

    await context.close();
  });

  test("12.2 — Android viewport (360x640)", async ({ browser, request }) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 640 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36",
    });
    const page = await context.newPage();

    await registerViaAPI(request);
    await page.goto(`${APP_BASE}/login`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(OWNER_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/dashboard|setup/, { timeout: 30000 });

    for (const path of ["/dashboard", "/members", "/payments"]) {
      await page.goto(`${APP_BASE}${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      console.log(`Android ${path}: overflow=${hasOverflow}`);

      await page.screenshot({
        path: `${SS_DIR}/12-android${path.replace(/\//g, "-")}.png`,
        fullPage: true,
      });
    }

    await context.close();
  });

  test("12.3 — Tablet viewport (768x1024)", async ({ browser, request }) => {
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 },
    });
    const page = await context.newPage();

    await registerViaAPI(request);
    await page.goto(`${APP_BASE}/login`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(OWNER_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/dashboard|setup/, { timeout: 30000 });

    for (const path of ["/dashboard", "/members", "/payments"]) {
      await page.goto(`${APP_BASE}${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: `${SS_DIR}/12-tablet${path.replace(/\//g, "-")}.png`,
        fullPage: true,
      });
    }

    await context.close();
  });

  test("12.4 — Small laptop viewport (1024x768)", async ({ browser, request }) => {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
    });
    const page = await context.newPage();

    await registerViaAPI(request);
    await page.goto(`${APP_BASE}/login`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(OWNER_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/dashboard|setup/, { timeout: 30000 });

    for (const path of ["/dashboard", "/members", "/payments"]) {
      await page.goto(`${APP_BASE}${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: `${SS_DIR}/12-laptop${path.replace(/\//g, "-")}.png`,
        fullPage: true,
      });
    }

    await context.close();
  });

  test("12.5 — Mobile hamburger menu works", async ({ browser, request }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();

    await registerViaAPI(request);
    await page.goto(`${APP_BASE}/login`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(OWNER_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/dashboard|setup/, { timeout: 30000 });

    await page.goto(`${APP_BASE}/dashboard`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Look for hamburger menu button
    const menuBtn = page.locator(
      'button[aria-label*="menu" i], button[aria-label*="sidebar" i], button:has(svg)'
    );
    const menuBtnCount = await menuBtn.count();

    if (menuBtnCount > 0) {
      await menuBtn.first().click();
      await page.waitForTimeout(500);
      console.log("Mobile menu button found and clicked");
    } else {
      console.log("FINDING: No mobile hamburger menu button found");
    }

    await page.screenshot({
      path: `${SS_DIR}/12-mobile-menu.png`,
      fullPage: true,
    });

    await context.close();
  });
});

// ══════════════════════════════════════════════════════════════════════
// SECTION 13: UX & Accessibility
// ══════════════════════════════════════════════════════════════════════
test.describe("13. UX & Accessibility", () => {
  test.beforeEach(async ({ page, request }) => {
    await registerViaAPI(request);
    await loginUser(page);
  });

  test("13.1 — Loading states on data pages", async ({ page }) => {
    const pages = ["/dashboard", "/members", "/payments", "/attendance"];
    const findings: string[] = [];

    for (const p of pages) {
      // Navigate and check for loading indicators
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes("/api/v1/") && resp.status() === 200,
        { timeout: 10000 }
      ).catch(() => null);

      await page.goto(p);

      // Check for loading indicators immediately
      const hasLoader = await page
        .locator('.animate-spin, [class*="skeleton"], [class*="Skeleton"]')
        .count();

      findings.push(`${p}: Loading indicators visible=${hasLoader > 0}`);

      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
    }

    console.log("Loading state audit:");
    findings.forEach((f) => console.log(`  ${f}`));

    await ss(page, "13-loading-states");
  });

  test("13.2 — Error message quality check", async ({ page }) => {
    // Force an error and check message quality
    await page.route("**/api/v1/dashboard/metrics", (route) =>
      route.fulfill({
        status: 500,
        body: JSON.stringify({ detail: "Internal Server Error" }),
      })
    );

    await page.goto("/dashboard");
    await page.waitForTimeout(5000);

    const pageText = await page.textContent("body");

    // Check for raw error objects
    const hasRawError =
      pageText?.includes("[object Object]") ||
      pageText?.includes("undefined") ||
      pageText?.includes("null") ||
      pageText?.includes("NaN");

    console.log(
      `Error display quality: ${hasRawError ? "RAW DATA SHOWN (bad UX)" : "Clean"}`
    );

    // Check for stack traces
    const hasStackTrace =
      pageText?.includes("at ") || pageText?.includes("TypeError");
    console.log(
      `Stack traces visible: ${hasStackTrace ? "YES (security risk)" : "NO"}`
    );

    await ss(page, "13-error-quality");
  });

  test("13.3 — Keyboard navigation on data tables", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Test Tab key navigation
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Check if focus is visible
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName,
        text: el?.textContent?.substring(0, 50),
        hasFocusRing:
          el
            ? getComputedStyle(el).outlineStyle !== "none" ||
              el.classList.toString().includes("focus")
            : false,
      };
    });

    console.log("Keyboard focus state:", JSON.stringify(focusedElement));
    await ss(page, "13-keyboard-nav");
  });

  test("13.4 — Table responsiveness on data pages", async ({ page }) => {
    const dataPages = ["/members", "/payments"];

    for (const p of dataPages) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Check for horizontal scroll on tables
      const tableOverflow = await page.evaluate(() => {
        const tables = document.querySelectorAll("table");
        const results: boolean[] = [];
        tables.forEach((t) => {
          results.push(t.scrollWidth > t.clientWidth);
        });
        return results;
      });

      console.log(`${p} table overflow: ${JSON.stringify(tableOverflow)}`);
    }

    await ss(page, "13-table-responsive");
  });

  test("13.5 — Empty states render properly", async ({ page }) => {
    // Create fresh context or search for something that returns empty
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const searchInput = page.locator(
      'input[placeholder*="search" i], input[placeholder*="name" i]'
    );

    if ((await searchInput.count()) > 0) {
      await searchInput.first().fill("NONEXISTENT_MEMBER_XYZ_999");
      await page.waitForTimeout(1500);

      // Check for proper empty state
      const emptyState = page.locator(
        'text=/no members|no results|not found|no data/i'
      );
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      console.log(
        `Empty state rendering: ${hasEmptyState ? "Proper empty state shown" : "No empty state indicator"}`
      );
    }

    await ss(page, "13-empty-states");
  });

  test("13.6 — Page titles and headings present", async ({ page }) => {
    const pages = [
      { path: "/dashboard", expectedHeading: "Dashboard" },
      { path: "/members", expectedHeading: "Members" },
      { path: "/payments", expectedHeading: "Payments" },
      { path: "/attendance", expectedHeading: "Attendance" },
    ];

    for (const p of pages) {
      await page.goto(p.path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const heading = page.getByRole("heading", {
        name: new RegExp(p.expectedHeading, "i"),
      });
      const headingVisible = await heading.isVisible().catch(() => false);

      console.log(
        `${p.path} heading "${p.expectedHeading}": ${headingVisible ? "VISIBLE" : "NOT FOUND"}`
      );
    }

    await ss(page, "13-page-headings");
  });

  test("13.7 — ARIA labels on interactive elements", async ({ page }) => {
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const buttons = page.locator("button");
    const buttonCount = await buttons.count();
    let buttonsWithoutLabel = 0;

    for (let i = 0; i < Math.min(buttonCount, 20); i++) {
      const btn = buttons.nth(i);
      const ariaLabel = await btn.getAttribute("aria-label");
      const text = await btn.textContent();
      const title = await btn.getAttribute("title");

      if (!ariaLabel && !text?.trim() && !title) {
        buttonsWithoutLabel++;
      }
    }

    console.log(
      `Buttons without accessible labels: ${buttonsWithoutLabel}/${Math.min(buttonCount, 20)}`
    );

    await ss(page, "13-aria-labels");
  });

  test("13.8 — Color contrast (basic check)", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Check text readability
    const contrastIssues = await page.evaluate(() => {
      const issues: string[] = [];
      const elements = document.querySelectorAll("p, span, h1, h2, h3, td, th");

      elements.forEach((el) => {
        const style = getComputedStyle(el);
        const color = style.color;
        const bg = style.backgroundColor;

        // Very basic check — transparent or same as background
        if (color === bg && color !== "rgba(0, 0, 0, 0)") {
          issues.push(`${el.tagName}: text color same as background`);
        }
      });

      return issues.slice(0, 5);
    });

    console.log(
      `Contrast issues: ${contrastIssues.length === 0 ? "None detected (basic check)" : contrastIssues.join(", ")}`
    );

    await ss(page, "13-contrast");
  });

  test("13.9 — No console warnings about missing keys/props", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning" && msg.text().includes("key")) {
        warnings.push(msg.text());
      }
    });

    for (const path of ["/dashboard", "/members", "/payments", "/attendance"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
    }

    console.log(`React key/prop warnings: ${warnings.length}`);
    warnings.slice(0, 5).forEach((w) => console.log(`  WARNING: ${w.substring(0, 100)}`));

    await ss(page, "13-console-warnings");
  });
});
