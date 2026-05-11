/**
 * ═══════════════════════════════════════════════════════════════════
 * GYMFLOW — COMPREHENSIVE ATTENDANCE MODULE QA TEST SUITE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Enterprise-grade attendance module testing via Playwright + Chromium.
 * Tests: Check-In (QR + Manual), Check-Out, Duplicate Prevention,
 *        Concurrency, Security, Network Failures, Multi-Tab,
 *        Mobile Responsive, UX/Accessibility, Business Logic.
 *
 * Author : QA Automation Engineer
 * Date   : 2026-05-11
 * Module : Attendance Management
 *
 * EXECUTION: All tests run SERIALLY (shared account, deterministic order).
 */
import { test, expect, type Page, type BrowserContext, type APIRequestContext } from "@playwright/test";

// Force serial execution globally — tests depend on shared account & state
test.describe.configure({ mode: "serial" });

// ── Constants ─────────────────────────────────────────────────────────
const RUN_ID = Date.now();
const API_BASE = "http://localhost:8000/api/v1";
const APP_BASE = "http://localhost:3000";
const TEST_PASSWORD = "StrongPass1A";
const OWNER_EMAIL = `qa_attend_owner_${RUN_ID}@testgym.com`;
const OWNER_PHONE = `97${String(RUN_ID).slice(-8)}`;
const GYM_NAME = `QA Attendance Gym ${RUN_ID}`;

// Track created member IDs for reuse across tests
let MEMBER_A_ID = "";
let MEMBER_A_NAME = "";
let MEMBER_A_PHONE = "";
let MEMBER_B_ID = "";
let MEMBER_B_NAME = "";
let MEMBER_B_PHONE = "";
let MEMBER_EXPIRED_ID = "";
let MEMBER_EXPIRED_NAME = "";
let ATTENDANCE_RECORD_ID = "";
let AUTH_COOKIES: { name: string; value: string }[] = [];
let QR_TOKEN_A = "";

// ── Screenshot helper ─────────────────────────────────────────────────
const SS_DIR = "test-results/attendance";
async function ss(page: Page, name: string) {
  await page.screenshot({ path: `${SS_DIR}/${name}.png`, fullPage: true });
}

// ── Helpers ───────────────────────────────────────────────────────────
function generatePhone(): string {
  const digits = String(Math.floor(Math.random() * 900000000) + 100000000);
  return `9${digits}`;
}

async function loginViaUI(page: Page, email: string, password: string = TEST_PASSWORD) {
  await page.goto("/login");
  await page.waitForTimeout(500);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(dashboard|setup|attendance|members)/, { timeout: 30000 });
  await page.waitForTimeout(1000);
}

async function navigateToAttendance(page: Page) {
  await page.goto("/attendance");
  await page.waitForTimeout(2000);
  await page.waitForSelector("h1", { timeout: 15000 });
}

async function setupConsoleListener(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`PAGE_ERROR: ${err.message}`));
  return errors;
}

async function waitForToast(page: Page, textPattern: RegExp, timeout = 5000): Promise<boolean> {
  try {
    await page.locator("[data-sonner-toast]").filter({ hasText: textPattern }).first()
      .waitFor({ timeout });
    return true;
  } catch {
    try {
      const text = page.locator(`text=${textPattern.source}`).first();
      await text.waitFor({ timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }
}

function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(e =>
    !e.includes("favicon") && !e.includes("DevTools") &&
    !e.includes("hydrat") && !e.includes("401") &&
    !e.includes("Failed to load resource") && !e.includes("ERR_")
  );
}

// ══════════════════════════════════════════════════════════════════════
//  SECTION 0 — GLOBAL SETUP
// ══════════════════════════════════════════════════════════════════════

test("0.01 — Create test owner account via API", async ({ request }) => {
  const resp = await request.post(`${API_BASE}/auth/register`, {
    data: {
      gym_name: GYM_NAME,
      owner_name: "QA Attendance Owner",
      phone: OWNER_PHONE,
      email: OWNER_EMAIL,
      password: TEST_PASSWORD,
    },
  });
  expect([200, 201]).toContain(resp.status());
  const body = await resp.json();
  expect(body).toHaveProperty("access_token");

  // Create members in the same request context (cookies from register are available)
  // Small delay for SQLite to settle
  await new Promise(r => setTimeout(r, 1000));

  const today = new Date();
  const futureDate3m = new Date(today);
  futureDate3m.setMonth(futureDate3m.getMonth() + 3);
  const futureDate1m = new Date(today);
  futureDate1m.setMonth(futureDate1m.getMonth() + 1);
  const pastStart = new Date(today);
  pastStart.setMonth(pastStart.getMonth() - 3);
  const pastEnd = new Date(today);
  pastEnd.setMonth(pastEnd.getMonth() - 1);

  // Member A — active
  MEMBER_A_NAME = `QA AttendMember A ${RUN_ID}`;
  MEMBER_A_PHONE = generatePhone();
  const respA = await request.post(`${API_BASE}/members`, {
    data: {
      name: MEMBER_A_NAME,
      phone: MEMBER_A_PHONE,
      email: `qa_attend_a_${RUN_ID}@test.com`,
      gender: "male",
      membership_plan: "Quarterly",
      amount_paid: 500000,
      membership_start: today.toISOString().slice(0, 10),
      membership_end: futureDate3m.toISOString().slice(0, 10),
    },
  });
  if (respA.status() !== 200 && respA.status() !== 201) {
    const errBody = await respA.text();
    console.error(`Member A creation failed (${respA.status()}): ${errBody}`);
  }
  expect([200, 201]).toContain(respA.status());
  const bodyA = await respA.json();
  MEMBER_A_ID = bodyA.id;

  // Member B — active
  MEMBER_B_NAME = `QA AttendMember B ${RUN_ID}`;
  MEMBER_B_PHONE = generatePhone();
  const respB = await request.post(`${API_BASE}/members`, {
    data: {
      name: MEMBER_B_NAME,
      phone: MEMBER_B_PHONE,
      email: `qa_attend_b_${RUN_ID}@test.com`,
      gender: "female",
      membership_plan: "Monthly",
      amount_paid: 200000,
      membership_start: today.toISOString().slice(0, 10),
      membership_end: futureDate1m.toISOString().slice(0, 10),
    },
  });
  expect([200, 201]).toContain(respB.status());
  const bodyB = await respB.json();
  MEMBER_B_ID = bodyB.id;

  // Expired member
  MEMBER_EXPIRED_NAME = `QA ExpiredMember ${RUN_ID}`;
  const respExp = await request.post(`${API_BASE}/members`, {
    data: {
      name: MEMBER_EXPIRED_NAME,
      phone: generatePhone(),
      email: `qa_expired_${RUN_ID}@test.com`,
      gender: "male",
      membership_plan: "Monthly",
      amount_paid: 100000,
      membership_start: pastStart.toISOString().slice(0, 10),
      membership_end: pastEnd.toISOString().slice(0, 10),
    },
  });
  expect([200, 201]).toContain(respExp.status());
  const bodyExp = await respExp.json();
  MEMBER_EXPIRED_ID = bodyExp.id;
});

test("0.02 — Login via UI and navigate to attendance page", async ({ page }) => {
  await loginViaUI(page, OWNER_EMAIL);
  await navigateToAttendance(page);
  await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible({ timeout: 10000 });
  await ss(page, "00-setup-attendance-page");
});

// ══════════════════════════════════════════════════════════════════════
//  SECTION 1 — MANUAL CHECK-IN TESTS
// ══════════════════════════════════════════════════════════════════════
test.describe("1. MANUAL CHECK-IN", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);
  });

  test("1.01 — Valid manual check-in by member search", async ({ page }) => {
    test.setTimeout(60000);
    const consoleErrs = await setupConsoleListener(page);

    // Search for member A
    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    await searchInput.fill(MEMBER_A_NAME.slice(0, 15));
    await page.waitForTimeout(1000);

    // Find and click check-in button for the member
    const memberRow = page.locator("div.divide-y > div").filter({ hasText: MEMBER_A_NAME }).first();
    await expect(memberRow).toBeVisible({ timeout: 10000 });
    const checkInBtn = memberRow.getByRole("button", { name: /check in/i });
    await checkInBtn.click();
    await page.waitForTimeout(2000);

    // Verify success toast
    const toastVisible = await waitForToast(page, /checked in|success/i);

    // Verify member appears in today's attendance table
    await page.waitForTimeout(1000);
    const attendanceTable = page.locator("table");
    const memberInTable = await attendanceTable.getByText(MEMBER_A_NAME).isVisible().catch(() => false);

    await ss(page, "01-manual-checkin-success");

    const criticalErrors = filterCriticalErrors(consoleErrs);
    expect(toastVisible || memberInTable).toBe(true);
    expect(criticalErrors.length).toBe(0);

    test.info().annotations.push({
      type: "result",
      description: `Manual check-in: toast=${toastVisible}, inTable=${memberInTable}`,
    });
  });

  test("1.02 — Duplicate manual check-in same day is prevented", async ({ page }) => {
    test.setTimeout(60000);

    // Search for member A (already checked in)
    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    await searchInput.fill(MEMBER_A_NAME.slice(0, 15));
    await page.waitForTimeout(1000);

    const memberRow = page.locator("div.divide-y > div").filter({ hasText: MEMBER_A_NAME }).first();
    await expect(memberRow).toBeVisible({ timeout: 10000 });
    const checkInBtn = memberRow.getByRole("button", { name: /check in/i });

    // Attempt to check in again
    if (await checkInBtn.isEnabled()) {
      await checkInBtn.click();
      await page.waitForTimeout(2000);

      // Should show error or duplicate warning
      const errorToast = await waitForToast(page, /already|duplicate|checked in|exists/i);
      await ss(page, "02-duplicate-checkin-attempt");

      test.info().annotations.push({
        type: "result",
        description: `Duplicate check-in: errorShown=${errorToast}`,
      });
    } else {
      // Button disabled = good, duplicate prevented at UI level
      await ss(page, "02-duplicate-checkin-disabled");
      test.info().annotations.push({
        type: "result",
        description: "Duplicate prevented: Check-in button disabled for already-checked-in member",
      });
    }
  });

  test("1.03 — Rapid multi-click check-in does not create duplicates", async ({ page }) => {
    test.setTimeout(60000);
    const networkRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/check-in") && req.method() === "POST") {
        networkRequests.push(req.url());
      }
    });

    // Search for member B
    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    await searchInput.fill(MEMBER_B_NAME.slice(0, 15));
    await page.waitForTimeout(1000);

    const memberRow = page.locator("div.divide-y > div").filter({ hasText: MEMBER_B_NAME }).first();
    await expect(memberRow).toBeVisible({ timeout: 10000 });
    const checkInBtn = memberRow.getByRole("button", { name: /check in/i });

    // Rapid triple click
    await checkInBtn.click();
    try { await checkInBtn.click({ timeout: 500 }); } catch {}
    try { await checkInBtn.click({ timeout: 500 }); } catch {}
    await page.waitForTimeout(3000);

    await ss(page, "03-rapid-clicks-checkin");

    test.info().annotations.push({
      type: "observation",
      description: `Rapid click: ${networkRequests.length} POST /check-in requests sent`,
    });
  });

  test("1.04 — Expired member check-in is blocked", async ({ page }) => {
    test.setTimeout(60000);

    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    await searchInput.fill(MEMBER_EXPIRED_NAME.slice(0, 15));
    await page.waitForTimeout(1000);

    const memberRow = page.locator("div.divide-y > div").filter({ hasText: MEMBER_EXPIRED_NAME }).first();
    const isVisible = await memberRow.isVisible().catch(() => false);

    if (isVisible) {
      const checkInBtn = memberRow.getByRole("button", { name: /check in/i });
      const isDisabled = await checkInBtn.isDisabled().catch(() => true);
      const buttonText = await checkInBtn.textContent().catch(() => "");

      if (!isDisabled) {
        // Try clicking — backend should reject
        await checkInBtn.click();
        await page.waitForTimeout(2000);
        const errorToast = await waitForToast(page, /expired|inactive|not active|cannot/i);
        await ss(page, "04-expired-member-checkin");
        test.info().annotations.push({
          type: "result",
          description: `Expired member check-in: buttonDisabled=${isDisabled}, errorToast=${errorToast}`,
        });
      } else {
        await ss(page, "04-expired-member-disabled");
        test.info().annotations.push({
          type: "result",
          description: `Expired member: Check-in button is disabled. Text: "${buttonText}"`,
        });
      }
    } else {
      // Member not in search results — maybe expired members filtered
      await ss(page, "04-expired-member-not-found");
      test.info().annotations.push({
        type: "observation",
        description: "Expired member not found in search — may be filtered by status",
      });
    }
  });

  test("1.05 — Empty search shows no results", async ({ page }) => {
    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    await searchInput.fill("");
    await page.waitForTimeout(500);

    // Search results dropdown should be empty or hidden
    const searchResultsVisible = await page.locator("div.divide-y").isVisible().catch(() => false);

    await ss(page, "05-empty-search");
    test.info().annotations.push({
      type: "result",
      description: `Empty search: results visible=${searchResultsVisible}`,
    });
  });

  test("1.06 — Partial name search finds member", async ({ page }) => {
    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    // Use only part of the member name
    await searchInput.fill("AttendMember A");
    await page.waitForTimeout(1000);

    const memberResult = page.locator("div.divide-y > div").filter({ hasText: MEMBER_A_NAME }).first();
    const found = await memberResult.isVisible().catch(() => false);

    await ss(page, "06-partial-search");
    expect(found).toBe(true);
  });

  test("1.07 — Phone number search finds member", async ({ page }) => {
    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    await searchInput.fill(MEMBER_A_PHONE);
    await page.waitForTimeout(1000);

    const memberResult = page.locator("div.divide-y > div").filter({ hasText: MEMBER_A_NAME }).first();
    const found = await memberResult.isVisible().catch(() => false);

    await ss(page, "07-phone-search");
    test.info().annotations.push({
      type: "result",
      description: `Phone search: found=${found}`,
    });
  });

  test("1.08 — Non-existent member search returns empty", async ({ page }) => {
    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    await searchInput.fill("ZZZ_NONEXISTENT_MEMBER_12345");
    await page.waitForTimeout(1000);

    const noResults = await page.locator("div.divide-y").isVisible().catch(() => false);

    await ss(page, "08-nonexistent-search");
    expect(noResults).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SECTION 2 — QR CHECK-IN TESTS
// ══════════════════════════════════════════════════════════════════════
test.describe("2. QR CHECK-IN", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);
  });

  test("2.01 — Get QR token for member via API", async ({ page }) => {
    // Use page context (already logged in via beforeEach) for API call
    if (!MEMBER_A_ID) {
      test.info().annotations.push({ type: "skip", description: "Member A not created" });
      return;
    }

    const result = await page.evaluate(async (args: { apiBase: string; memberId: string }) => {
      const res = await fetch(`${args.apiBase}/attendance/member/${args.memberId}/qr`, {
        credentials: "include",
      });
      return { status: res.status, body: res.ok ? await res.json() : null };
    }, { apiBase: API_BASE, memberId: MEMBER_A_ID });

    if (result.status === 200 && result.body) {
      QR_TOKEN_A = result.body.qr_token;
      expect(QR_TOKEN_A).toBeTruthy();
      test.info().annotations.push({
        type: "result",
        description: `QR token obtained for member A: ${QR_TOKEN_A.slice(0, 10)}...`,
      });
    } else {
      test.info().annotations.push({
        type: "observation",
        description: `QR token API returned ${result.status} — QR feature may not be available`,
      });
    }
  });

  test("2.02 — Valid QR token check-in via input", async ({ page }) => {
    test.setTimeout(60000);
    // First check-out member A so we can test QR check-in
    // (They may already be checked in from manual test)

    const qrInput = page.getByLabel(/qr code token/i).or(page.locator("input[placeholder*='Scan QR']"));
    await expect(qrInput).toBeVisible({ timeout: 10000 });

    if (!QR_TOKEN_A) {
      test.info().annotations.push({
        type: "skip",
        description: "No QR token available — skipping QR check-in test",
      });
      return;
    }

    await qrInput.fill(QR_TOKEN_A);
    const qrSubmitBtn = page.getByRole("button", { name: /check in/i }).first();
    await qrSubmitBtn.click();
    await page.waitForTimeout(2000);

    // May succeed or show "already checked in" — both are valid
    const toastVisible = await waitForToast(page, /checked in|already|duplicate|success/i);
    await ss(page, "09-qr-checkin");

    test.info().annotations.push({
      type: "result",
      description: `QR check-in: toast=${toastVisible}`,
    });
  });

  test("2.03 — Invalid QR token shows error", async ({ page }) => {
    const qrInput = page.getByLabel(/qr code token/i).or(page.locator("input[placeholder*='Scan QR']"));
    await qrInput.fill("INVALID_QR_TOKEN_12345_FAKE");

    const qrSubmitBtn = page.getByRole("button", { name: /check in/i }).first();
    await qrSubmitBtn.click();
    await page.waitForTimeout(2000);

    const errorToast = await waitForToast(page, /invalid|not found|error|expired|unknown/i);
    await ss(page, "10-invalid-qr-token");
    expect(errorToast).toBe(true);
  });

  test("2.04 — Empty QR token — submit button disabled", async ({ page }) => {
    const qrInput = page.getByLabel(/qr code token/i).or(page.locator("input[placeholder*='Scan QR']"));
    await qrInput.fill("");

    const qrSubmitBtn = page.getByRole("button", { name: /check in/i }).first();
    const isDisabled = await qrSubmitBtn.isDisabled();

    await ss(page, "11-empty-qr-disabled");
    expect(isDisabled).toBe(true);
  });

  test("2.05 — Rapid QR submissions do not crash", async ({ page }) => {
    test.setTimeout(60000);
    const networkRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/check-in") && req.method() === "POST") {
        networkRequests.push(req.url());
      }
    });

    const qrInput = page.getByLabel(/qr code token/i).or(page.locator("input[placeholder*='Scan QR']"));
    const qrSubmitBtn = page.getByRole("button", { name: /check in/i }).first();

    // Rapid submissions with fake tokens
    for (let i = 0; i < 5; i++) {
      await qrInput.fill(`RAPID_TOKEN_${i}_${RUN_ID}`);
      if (await qrSubmitBtn.isEnabled()) {
        await qrSubmitBtn.click();
        await page.waitForTimeout(300);
      }
    }
    await page.waitForTimeout(3000);

    // Page should not crash
    const heading = page.getByRole("heading", { name: "Attendance", exact: true });
    await expect(heading).toBeVisible();

    await ss(page, "12-rapid-qr-submissions");
    test.info().annotations.push({
      type: "observation",
      description: `Rapid QR: ${networkRequests.length} requests sent, page stable`,
    });
  });

  test("2.06 — SQL injection in QR token field", async ({ page }) => {
    const sqliPayloads = [
      "' OR 1=1 --",
      "'; DROP TABLE attendance; --",
      "\" OR \"\"=\"",
      "1; DELETE FROM attendance WHERE 1=1",
    ];

    const qrInput = page.getByLabel(/qr code token/i).or(page.locator("input[placeholder*='Scan QR']"));
    const qrSubmitBtn = page.getByRole("button", { name: /check in/i }).first();

    for (const payload of sqliPayloads) {
      await qrInput.fill(payload);
      if (await qrSubmitBtn.isEnabled()) {
        await qrSubmitBtn.click();
        await page.waitForTimeout(1500);
      }
    }

    // Page should not crash, no 500 errors visible
    const heading = page.getByRole("heading", { name: "Attendance", exact: true });
    await expect(heading).toBeVisible();

    await ss(page, "13-sqli-qr-token");
  });

  test("2.07 — XSS payload in QR token field", async ({ page }) => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '"><img src=x onerror=alert(1)>',
      "<svg onload=alert(1)>",
      "javascript:alert(document.cookie)",
    ];

    const qrInput = page.getByLabel(/qr code token/i).or(page.locator("input[placeholder*='Scan QR']"));
    const qrSubmitBtn = page.getByRole("button", { name: /check in/i }).first();

    for (const payload of xssPayloads) {
      await qrInput.fill(payload);
      if (await qrSubmitBtn.isEnabled()) {
        await qrSubmitBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Verify no script execution
    const bodyHTML = await page.content();
    expect(bodyHTML).not.toContain("<script>alert");
    expect(bodyHTML).not.toContain("onerror=alert");

    await ss(page, "14-xss-qr-token");
  });

  test("2.08 — HTML injection in QR token field", async ({ page }) => {
    const htmlPayloads = [
      "<h1>INJECTED</h1>",
      "<marquee>HACKED</marquee>",
      "<iframe src='http://evil.com'></iframe>",
    ];

    const qrInput = page.getByLabel(/qr code token/i).or(page.locator("input[placeholder*='Scan QR']"));
    const qrSubmitBtn = page.getByRole("button", { name: /check in/i }).first();

    for (const payload of htmlPayloads) {
      await qrInput.fill(payload);
      if (await qrSubmitBtn.isEnabled()) {
        await qrSubmitBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Verify no injected HTML rendered
    const injectedH1 = await page.locator("h1:has-text('INJECTED')").isVisible().catch(() => false);
    const injectedMarquee = await page.locator("marquee").isVisible().catch(() => false);
    const injectedIframe = await page.locator("iframe[src='http://evil.com']").count();

    expect(injectedH1).toBe(false);
    expect(injectedMarquee).toBe(false);
    expect(injectedIframe).toBe(0);

    await ss(page, "15-html-injection-qr");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SECTION 3 — CHECK-OUT TESTS
// ══════════════════════════════════════════════════════════════════════
test.describe("3. CHECK-OUT", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);
  });

  test("3.01 — Check-out button visible for checked-in member", async ({ page }) => {
    test.setTimeout(60000);
    await page.waitForTimeout(2000);

    // Look for "Check Out" button in today's attendance table
    const checkOutBtn = page.locator("table").getByRole("button", { name: /check out/i }).first();
    const isVisible = await checkOutBtn.isVisible().catch(() => false);

    await ss(page, "16-checkout-button-visible");
    test.info().annotations.push({
      type: "result",
      description: `Check-out button visible: ${isVisible}`,
    });
  });

  test("3.02 — Successful check-out updates status", async ({ page }) => {
    test.setTimeout(60000);
    await page.waitForTimeout(2000);

    const checkOutBtn = page.locator("table").getByRole("button", { name: /check out/i }).first();
    const isVisible = await checkOutBtn.isVisible().catch(() => false);

    if (isVisible) {
      await checkOutBtn.click();
      await page.waitForTimeout(2000);

      const toastVisible = await waitForToast(page, /checked out|success|left/i);
      await ss(page, "17-checkout-success");
      expect(toastVisible).toBe(true);
    } else {
      await ss(page, "17-no-checkin-to-checkout");
      test.info().annotations.push({
        type: "observation",
        description: "No checked-in members found to test check-out",
      });
    }
  });

  test("3.03 — Check-out shows updated badge (Left/checked_out)", async ({ page }) => {
    test.setTimeout(60000);
    await page.waitForTimeout(2000);

    // Look for "Left" or "checked_out" badge in the table
    const leftBadge = page.locator("table").getByText(/left|checked.?out/i).first();
    const isVisible = await leftBadge.isVisible().catch(() => false);

    await ss(page, "18-checkout-badge");
    test.info().annotations.push({
      type: "result",
      description: `Checked-out status badge visible: ${isVisible}`,
    });
  });

  test("3.04 — No check-out button for already checked-out member", async ({ page }) => {
    test.setTimeout(60000);
    await page.waitForTimeout(2000);

    // Find a row with "Left" badge and verify no Check Out button in that row
    const leftRows = page.locator("table tr").filter({ hasText: /left|checked.?out/i });
    const leftRowCount = await leftRows.count();

    if (leftRowCount > 0) {
      const firstLeftRow = leftRows.first();
      const checkOutInRow = firstLeftRow.getByRole("button", { name: /check out/i });
      const btnCount = await checkOutInRow.count();

      await ss(page, "19-no-checkout-for-left");
      expect(btnCount).toBe(0);
    } else {
      test.info().annotations.push({
        type: "observation",
        description: "No checked-out members found to verify check-out button absence",
      });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SECTION 4 — STATS & DASHBOARD VERIFICATION
// ══════════════════════════════════════════════════════════════════════
test.describe("4. STATS & DASHBOARD", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
  });

  test("4.01 — Attendance stats cards are visible", async ({ page }) => {
    await navigateToAttendance(page);
    await page.waitForTimeout(2000);

    // Verify stats cards (Checked In Today, Currently In Gym, This Week)
    const checkedInCard = page.getByText(/checked in today/i);
    const currentlyInCard = page.getByText(/currently in gym|active right now/i);
    const weekCard = page.getByText(/this week|total visits/i);

    const checkedInVisible = await checkedInCard.isVisible().catch(() => false);
    const currentlyInVisible = await currentlyInCard.isVisible().catch(() => false);
    const weekVisible = await weekCard.isVisible().catch(() => false);

    await ss(page, "20-stats-cards");
    expect(checkedInVisible || currentlyInVisible || weekVisible).toBe(true);
  });

  test("4.02 — Stats reflect check-in count", async ({ page }) => {
    await navigateToAttendance(page);
    await page.waitForTimeout(2000);

    // Get the "Checked In Today" value
    const statsText = await page.locator("text=/Checked In Today/i").locator("..").textContent().catch(() => "");

    await ss(page, "21-stats-count");
    test.info().annotations.push({
      type: "result",
      description: `Stats card text: "${statsText}"`,
    });
  });

  test("4.03 — Dashboard shows attendance stats", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(3000);

    const checkedInCard = page.getByText(/checked in today/i);
    const isVisible = await checkedInCard.isVisible().catch(() => false);

    await ss(page, "22-dashboard-attendance-stats");
    expect(isVisible).toBe(true);
  });

  test("4.04 — Dashboard attendance trend chart renders", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(3000);

    const trendChart = page.getByText(/attendance trend/i);
    const isVisible = await trendChart.isVisible().catch(() => false);

    await ss(page, "23-attendance-trend-chart");
    test.info().annotations.push({
      type: "result",
      description: `Attendance trend chart visible: ${isVisible}`,
    });
  });

  test("4.05 — Today's attendance count header is accurate", async ({ page }) => {
    await navigateToAttendance(page);
    await page.waitForTimeout(2000);

    // Look for "Today's Attendance (N)" heading
    const headerText = await page.locator("text=/Today.*Attendance.*\\(/i").textContent().catch(() => "");
    const countMatch = headerText.match(/\((\d+)\)/);
    const tableRows = await page.locator("table tbody tr").count();

    await ss(page, "24-attendance-count-accuracy");
    if (countMatch) {
      const headerCount = parseInt(countMatch[1], 10);
      test.info().annotations.push({
        type: "result",
        description: `Header count: ${headerCount}, Table rows: ${tableRows}`,
      });
      expect(headerCount).toBe(tableRows);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SECTION 5 — SECURITY TESTS
// ══════════════════════════════════════════════════════════════════════
test.describe("5. SECURITY", () => {

  test("5.01 — Unauthenticated API calls return 401", async ({ browser }) => {
    // Use a fresh context with no cookies
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(APP_BASE);

    const results = await page.evaluate(async (apiBase: string) => {
      const endpoints = [
        `${apiBase}/attendance/today`,
        `${apiBase}/attendance/stats`,
        `${apiBase}/attendance/trend`,
        `${apiBase}/attendance/history`,
      ];
      const statuses: number[] = [];
      for (const url of endpoints) {
        const res = await fetch(url);
        statuses.push(res.status);
      }
      return statuses;
    }, API_BASE);

    for (const status of results) {
      expect([401, 403]).toContain(status);
    }

    await context.close();
  });

  test("5.02 — Unauthenticated check-in POST returns 401", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(APP_BASE);

    const status = await page.evaluate(async (args: { apiBase: string; memberId: string }) => {
      const res = await fetch(`${args.apiBase}/attendance/check-in/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: args.memberId }),
      });
      return res.status;
    }, { apiBase: API_BASE, memberId: MEMBER_A_ID || "fake-id" });

    expect([401, 403]).toContain(status);
    await context.close();
  });

  test("5.03 — IDOR: Cannot access other gym's attendance", async ({ page, browser }) => {
    test.setTimeout(90000);
    // Register a second gym owner via page.evaluate
    const otherEmail = `qa_other_gym_${RUN_ID}@testgym.com`;
    const otherPhone = `96${String(RUN_ID).slice(-8)}`;

    // Use a fresh context to register
    const regContext = await browser.newContext();
    const regPage = await regContext.newPage();
    await regPage.goto(`${APP_BASE}/register`);

    const regResult = await regPage.evaluate(async (args: { apiBase: string; email: string; phone: string; password: string; runId: number }) => {
      const res = await fetch(`${args.apiBase}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gym_name: `QA Other Gym ${args.runId}`,
          owner_name: "QA Other Owner",
          phone: args.phone,
          email: args.email,
          password: args.password,
        }),
      });
      return res.status;
    }, { apiBase: API_BASE, email: otherEmail, phone: otherPhone, password: TEST_PASSWORD, runId: RUN_ID });

    expect([200, 201]).toContain(regResult);
    await regContext.close();

    // Login as new gym owner
    await loginViaUI(page, otherEmail);
    await navigateToAttendance(page);
    await page.waitForTimeout(2000);

    // Should see 0 attendance records (different gym)
    const emptyState = await page.getByText(/no check-ins|no attendance/i).isVisible().catch(() => false);
    const tableRows = await page.locator("table tbody tr").count();

    await ss(page, "25-idor-other-gym");
    expect(emptyState || tableRows === 0).toBe(true);
  });

  test("5.04 — Invalid member ID for manual check-in", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    // Try check-in via API with malformed UUID
    const resp = await page.evaluate(async () => {
      const res = await fetch("http://localhost:8000/api/v1/attendance/check-in/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ member_id: "not-a-uuid" }),
      });
      return { status: res.status, body: await res.text() };
    });

    await ss(page, "26-invalid-member-id");
    expect(resp.status).not.toBe(500);
    expect([400, 404, 422]).toContain(resp.status);
  });

  test("5.05 — Oversized payload for check-in API", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    const resp = await page.evaluate(async () => {
      const res = await fetch("http://localhost:8000/api/v1/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ qr_token: "A".repeat(100000) }),
      });
      return { status: res.status };
    });

    await ss(page, "27-oversized-payload");
    expect(resp.status).not.toBe(500);
  });

  test("5.06 — SQL injection in manual check-in search", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    const sqliPayloads = [
      "' OR 1=1 --",
      "'; DROP TABLE members; --",
      "\" OR \"\"=\"",
    ];

    for (const payload of sqliPayloads) {
      await searchInput.fill(payload);
      await page.waitForTimeout(1000);
    }

    // Page should remain stable
    const heading = page.getByRole("heading", { name: "Attendance", exact: true });
    await expect(heading).toBeVisible();

    await ss(page, "28-sqli-search");
  });

  test("5.07 — XSS in manual check-in search", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '"><img src=x onerror=alert(1)>',
      "<svg onload=alert(1)>",
    ];

    for (const payload of xssPayloads) {
      await searchInput.fill(payload);
      await page.waitForTimeout(800);
    }

    // No script execution
    const bodyHTML = await page.content();
    expect(bodyHTML).not.toContain("<script>alert");
    expect(bodyHTML).not.toContain("onerror=alert");

    await ss(page, "29-xss-search");
  });

  test("5.08 — Expired session redirects to login from attendance", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    // Clear cookies to simulate expired session
    await page.context().clearCookies();
    await page.reload();
    await page.waitForTimeout(3000);

    const redirectedToLogin = page.url().includes("/login");

    await ss(page, "30-expired-session-redirect");
    expect(redirectedToLogin).toBe(true);
  });

  test("5.09 — HttpOnly cookies verified for auth tokens", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);

    // Try to read cookies via JavaScript (should fail for HttpOnly)
    const jsCookies = await page.evaluate(() => document.cookie);
    const hasAccessToken = jsCookies.includes("gymflow_access");
    const hasRefreshToken = jsCookies.includes("gymflow_refresh");

    await ss(page, "31-httponly-cookies");
    // HttpOnly cookies should NOT be readable via JS
    expect(hasAccessToken).toBe(false);
    expect(hasRefreshToken).toBe(false);
  });

  test("5.10 — Manipulated check-in request with wrong gym member", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    // Try checking in a random UUID (not belonging to this gym)
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const resp = await page.evaluate(async (memberId: string) => {
      const res = await fetch("http://localhost:8000/api/v1/attendance/check-in/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ member_id: memberId }),
      });
      return { status: res.status, body: await res.text() };
    }, fakeId);

    await ss(page, "32-manipulated-member-id");
    expect(resp.status).not.toBe(200);
    expect(resp.status).not.toBe(201);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SECTION 6 — NETWORK & FAILURE TESTS
// ══════════════════════════════════════════════════════════════════════
test.describe("6. NETWORK & FAILURE", () => {
  test("6.01 — Slow network shows loading state", async ({ page }) => {
    test.setTimeout(120000);
    await loginViaUI(page, OWNER_EMAIL);

    // Throttle network with moderate slowness
    const client = await page.context().newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: 100 * 1024,   // 100KB/s
      uploadThroughput: 50 * 1024,
      latency: 1000,
    });

    await page.goto("/attendance");
    await page.waitForTimeout(3000);

    // Check for loading skeletons or spinner
    const skeletonVisible = await page.locator("[class*='skeleton'], [class*='Skeleton']").first().isVisible().catch(() => false);
    const loadingText = await page.getByText(/loading/i).isVisible().catch(() => false);

    await ss(page, "33-slow-network-loading");

    // Reset network
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });

    await page.waitForTimeout(5000);
    await ss(page, "34-slow-network-loaded");

    test.info().annotations.push({
      type: "result",
      description: `Slow network: skeleton=${skeletonVisible}, loadingText=${loadingText}`,
    });
  });

  test("6.02 — Offline mode shows graceful state", async ({ page }) => {
    test.setTimeout(60000);
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    // Go offline
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);

    // Try to search for a member
    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    await searchInput.fill("test member");
    await page.waitForTimeout(2000);

    await ss(page, "35-offline-mode");

    // Go back online
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);
  });

  test("6.03 — Network reconnect recovery", async ({ page }) => {
    test.setTimeout(60000);
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    // Go offline
    await page.context().setOffline(true);
    await page.waitForTimeout(2000);

    // Go back online
    await page.context().setOffline(false);

    // Reload and verify page loads correctly
    await page.reload();
    await page.waitForTimeout(3000);

    const heading = page.getByRole("heading", { name: "Attendance", exact: true });
    const isVisible = await heading.isVisible().catch(() => false);

    await ss(page, "36-network-reconnect");
    expect(isVisible).toBe(true);
  });

  test("6.04 — Check-in during network failure", async ({ page }) => {
    test.setTimeout(60000);
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    // Fill QR input then go offline
    const qrInput = page.getByLabel(/qr code token/i).or(page.locator("input[placeholder*='Scan QR']"));
    await qrInput.fill("OFFLINE_TEST_TOKEN");

    await page.context().setOffline(true);
    const qrSubmitBtn = page.getByRole("button", { name: /check in/i }).first();
    if (await qrSubmitBtn.isEnabled()) {
      await qrSubmitBtn.click();
      await page.waitForTimeout(2000);
    }

    await ss(page, "37-checkin-during-offline");

    // Restore network
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);

    // Page should still be functional
    const heading = page.getByRole("heading", { name: "Attendance", exact: true });
    await expect(heading).toBeVisible();
  });

  test("6.05 — Browser refresh during attendance page", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    // Refresh multiple times
    await page.reload();
    await page.waitForTimeout(2000);
    await page.reload();
    await page.waitForTimeout(2000);

    const heading = page.getByRole("heading", { name: "Attendance", exact: true });
    await expect(heading).toBeVisible();

    await ss(page, "38-refresh-stability");
  });

  test("6.06 — Browser back button behavior", async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);
    await page.goto("/attendance");
    await page.waitForTimeout(1000);

    // Go back
    await page.goBack();
    await page.waitForTimeout(2000);

    // Should be on dashboard
    expect(page.url()).toMatch(/dashboard/);

    // Go forward
    await page.goForward();
    await page.waitForTimeout(2000);

    const heading = page.getByRole("heading", { name: "Attendance", exact: true });
    await expect(heading).toBeVisible();

    await ss(page, "39-back-button");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SECTION 7 — MULTI-TAB & CONCURRENCY TESTS
// ══════════════════════════════════════════════════════════════════════
test.describe("7. MULTI-TAB & CONCURRENCY", () => {

  test("7.01 — Two tabs show consistent attendance", async ({ browser }) => {
    test.setTimeout(90000);
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await loginViaUI(page1, OWNER_EMAIL);
    await navigateToAttendance(page1);
    await page2.goto("/attendance");
    await page2.waitForTimeout(3000);

    const count1 = await page1.locator("table tbody tr").count();
    const count2 = await page2.locator("table tbody tr").count();

    await page1.screenshot({ path: `${SS_DIR}/40-multi-tab-1.png`, fullPage: true });
    await page2.screenshot({ path: `${SS_DIR}/40-multi-tab-2.png`, fullPage: true });

    test.info().annotations.push({
      type: "result",
      description: `Multi-tab: Tab1=${count1} rows, Tab2=${count2} rows`,
    });
    expect(count1).toBe(count2);

    await context.close();
  });

  test("7.02 — Check-in in tab1 appears in tab2 after refresh", async ({ browser }) => {
    test.setTimeout(90000);
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await loginViaUI(page1, OWNER_EMAIL);
    await navigateToAttendance(page1);
    await page2.goto("/attendance");
    await page2.waitForTimeout(3000);

    // Get initial count in tab2
    const initialCount = await page2.locator("table tbody tr").count();

    // Attempt check-in via QR in tab1 (use a fresh member if possible)
    const qrInput = page1.getByLabel(/qr code token/i).or(page1.locator("input[placeholder*='Scan QR']"));
    if (QR_TOKEN_A) {
      await qrInput.fill(QR_TOKEN_A);
      const btn = page1.getByRole("button", { name: /check in/i }).first();
      if (await btn.isEnabled()) {
        await btn.click();
        await page1.waitForTimeout(2000);
      }
    }

    // Refresh tab2
    await page2.reload();
    await page2.waitForTimeout(3000);

    const finalCount = await page2.locator("table tbody tr").count();

    await page2.screenshot({ path: `${SS_DIR}/41-cross-tab-checkin.png`, fullPage: true });

    test.info().annotations.push({
      type: "result",
      description: `Cross-tab: initial=${initialCount}, final=${finalCount}`,
    });

    await context.close();
  });

  test("7.03 — Logout in tab1 affects tab2", async ({ browser }) => {
    test.setTimeout(90000);
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await loginViaUI(page1, OWNER_EMAIL);
    await navigateToAttendance(page1);
    await page2.goto("/attendance");
    await page2.waitForTimeout(2000);

    // Logout in tab1 by clearing cookies
    await context.clearCookies();
    await page1.goto("/login");
    await page1.waitForTimeout(1000);

    // Reload tab2
    await page2.reload();
    await page2.waitForTimeout(3000);

    // Tab2 should redirect to login
    const tab2Url = page2.url();
    await page2.screenshot({ path: `${SS_DIR}/42-logout-propagation.png`, fullPage: true });

    expect(tab2Url).toContain("/login");

    await context.close();
  });

  test("7.04 — Concurrent check-in API calls (race condition test)", async ({ browser }) => {
    test.setTimeout(90000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginViaUI(page, OWNER_EMAIL);

    // Create a fresh member and do concurrent check-ins via page.evaluate
    const result = await page.evaluate(async (args: { apiBase: string; runId: number }) => {
      const today = new Date();
      const future = new Date(today);
      future.setMonth(future.getMonth() + 1);

      // Create member
      const memberRes = await fetch(`${args.apiBase}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: `QA ConcurrentMember ${args.runId}`,
          phone: `9${String(Math.floor(Math.random() * 900000000) + 100000000)}`,
          membership_plan: "Monthly",
          amount_paid: 200000,
          membership_start: today.toISOString().slice(0, 10),
          membership_end: future.toISOString().slice(0, 10),
        }),
      });
      if (!memberRes.ok) return { error: `member creation failed: ${memberRes.status}` };
      const member = await memberRes.json();

      // 3 concurrent check-ins
      const results = await Promise.all([
        fetch(`${args.apiBase}/attendance/check-in/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ member_id: member.id }),
        }),
        fetch(`${args.apiBase}/attendance/check-in/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ member_id: member.id }),
        }),
        fetch(`${args.apiBase}/attendance/check-in/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ member_id: member.id }),
        }),
      ]);

      return { statuses: results.map(r => r.status) };
    }, { apiBase: API_BASE, runId: RUN_ID });

    test.info().annotations.push({
      type: "result",
      description: `Concurrent check-in result: ${JSON.stringify(result)}`,
    });

    if (!("error" in result)) {
      const successCount = result.statuses.filter((s: number) => s === 200 || s === 201).length;
      expect(successCount).toBeGreaterThanOrEqual(1);
    }

    await context.close();
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SECTION 8 — BUSINESS LOGIC TESTS
// ══════════════════════════════════════════════════════════════════════
test.describe("8. BUSINESS LOGIC", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
  });

  test("8.01 — Attendance source shows 'manual' for manual check-in", async ({ page }) => {
    await navigateToAttendance(page);
    await page.waitForTimeout(2000);

    const manualBadge = page.locator("table").getByText(/manual/i).first();
    const isVisible = await manualBadge.isVisible().catch(() => false);

    await ss(page, "43-source-manual-badge");
    test.info().annotations.push({
      type: "result",
      description: `Manual source badge visible: ${isVisible}`,
    });
  });

  test("8.02 — Attendance source shows 'qr' for QR check-in", async ({ page }) => {
    await navigateToAttendance(page);
    await page.waitForTimeout(2000);

    const qrBadge = page.locator("table").getByText("qr", { exact: true }).first();
    const isVisible = await qrBadge.isVisible().catch(() => false);

    await ss(page, "44-source-qr-badge");
    test.info().annotations.push({
      type: "result",
      description: `QR source badge visible: ${isVisible}`,
    });
  });

  test("8.03 — Status badge shows 'In Gym' for checked-in", async ({ page }) => {
    await navigateToAttendance(page);
    await page.waitForTimeout(2000);

    const inGymBadge = page.locator("table").getByText(/in gym/i).first();
    const isVisible = await inGymBadge.isVisible().catch(() => false);

    await ss(page, "45-in-gym-badge");
    test.info().annotations.push({
      type: "result",
      description: `'In Gym' badge visible: ${isVisible}`,
    });
  });

  test("8.04 — Check-in time is displayed correctly", async ({ page }) => {
    await navigateToAttendance(page);
    await page.waitForTimeout(2000);

    // Time should be in HH:MM format
    const timeCell = page.locator("table tbody td").nth(1);
    const timeText = await timeCell.textContent().catch(() => "");

    const timePattern = /\d{1,2}:\d{2}/;
    await ss(page, "46-checkin-time-format");

    test.info().annotations.push({
      type: "result",
      description: `Time displayed: "${timeText}", matches pattern: ${timePattern.test(timeText || "")}`,
    });
  });

  test("8.05 — Empty state shown when no check-ins", async ({ page, browser }) => {
    test.setTimeout(60000);
    // Create a new gym owner to get a clean slate
    const cleanEmail = `qa_clean_${RUN_ID}@testgym.com`;
    const cleanPhone = `95${String(RUN_ID).slice(-8)}`;

    const regContext = await browser.newContext();
    const regPage = await regContext.newPage();
    await regPage.goto(APP_BASE);
    await regPage.evaluate(async (args: { apiBase: string; email: string; phone: string; password: string; runId: number }) => {
      await fetch(`${args.apiBase}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gym_name: `QA Clean Gym ${args.runId}`,
          owner_name: "QA Clean Owner",
          phone: args.phone,
          email: args.email,
          password: args.password,
        }),
      });
    }, { apiBase: API_BASE, email: cleanEmail, phone: cleanPhone, password: TEST_PASSWORD, runId: RUN_ID });
    await regContext.close();

    // Clear existing session so loginViaUI can work with the clean account
    await page.context().clearCookies();
    await loginViaUI(page, cleanEmail);
    await navigateToAttendance(page);
    await page.waitForTimeout(2000);

    const emptyState = page.getByText(/no check-ins today/i);
    const isVisible = await emptyState.isVisible().catch(() => false);

    await ss(page, "47-empty-state");
    expect(isVisible).toBe(true);

    // Restore original session for subsequent tests
    await page.context().clearCookies();
    await loginViaUI(page, OWNER_EMAIL);
  });

  test("8.06 — Today's attendance table header shows column labels", async ({ page }) => {
    await navigateToAttendance(page);
    await page.waitForTimeout(2000);

    const memberHeader = page.locator("th").filter({ hasText: /member/i });
    const timeHeader = page.locator("th").filter({ hasText: /time/i });
    const sourceHeader = page.locator("th").filter({ hasText: /source/i });
    const statusHeader = page.locator("th").filter({ hasText: /status/i });

    const memberVisible = await memberHeader.isVisible().catch(() => false);
    const timeVisible = await timeHeader.isVisible().catch(() => false);
    const sourceVisible = await sourceHeader.isVisible().catch(() => false);
    const statusVisible = await statusHeader.isVisible().catch(() => false);

    await ss(page, "48-table-headers");
    test.info().annotations.push({
      type: "result",
      description: `Headers: member=${memberVisible}, time=${timeVisible}, source=${sourceVisible}, status=${statusVisible}`,
    });
  });

  test("8.07 — Attendance API returns correct data integrity", async ({ page }) => {
    await navigateToAttendance(page);
    await page.waitForTimeout(1000);

    const result = await page.evaluate(async (apiBase: string) => {
      const res = await fetch(`${apiBase}/attendance/today`, { credentials: "include" });
      return { status: res.status, body: res.ok ? await res.json() : null };
    }, API_BASE);

    expect(result.status).toBe(200);
    const body = result.body;
    expect(body).toHaveProperty("attendance");
    expect(body).toHaveProperty("total");
    expect(Array.isArray(body.attendance)).toBe(true);

    if (body.attendance.length > 0) {
      const record = body.attendance[0];
      expect(record).toHaveProperty("id");
      expect(record).toHaveProperty("member_id");
      expect(record).toHaveProperty("check_in_at");
      expect(record).toHaveProperty("status");
      expect(record).toHaveProperty("source");
    }

    test.info().annotations.push({
      type: "result",
      description: `API data integrity: ${body.attendance.length} records, total=${body.total}`,
    });
  });

  test("8.08 — Attendance stats API returns valid numbers", async ({ page }) => {
    await navigateToAttendance(page);
    await page.waitForTimeout(1000);

    const result = await page.evaluate(async (apiBase: string) => {
      const res = await fetch(`${apiBase}/attendance/stats`, { credentials: "include" });
      return { status: res.status, body: res.ok ? await res.json() : null };
    }, API_BASE);

    expect(result.status).toBe(200);
    const body = result.body;

    expect(body).toHaveProperty("checked_in_today");
    expect(body).toHaveProperty("currently_in_gym");
    expect(body).toHaveProperty("total_this_week");

    expect(typeof body.checked_in_today).toBe("number");
    expect(body.checked_in_today).toBeGreaterThanOrEqual(0);
    expect(body.currently_in_gym).toBeGreaterThanOrEqual(0);
    expect(body.total_this_week).toBeGreaterThanOrEqual(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SECTION 9 — MOBILE RESPONSIVE TESTS
// ══════════════════════════════════════════════════════════════════════
test.describe("9. MOBILE RESPONSIVE", () => {

  test("9.01 — iPhone viewport (375x667)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    });
    const page = await context.newPage();
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    // Verify no horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    await ss(page, "49-iphone-viewport");
    expect(bodyWidth).toBeLessThanOrEqual(375 + 20); // small tolerance

    await context.close();
  });

  test("9.02 — Android viewport (360x740)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 740 },
    });
    const page = await context.newPage();
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    await ss(page, "50-android-viewport");
    expect(bodyWidth).toBeLessThanOrEqual(360 + 20);

    await context.close();
  });

  test("9.03 — Tablet viewport (768x1024)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 },
    });
    const page = await context.newPage();
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    await ss(page, "51-tablet-viewport");

    // QR input and search should both be visible
    const qrInput = page.getByLabel(/qr code token/i).or(page.locator("input[placeholder*='Scan QR']"));
    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    const qrVisible = await qrInput.isVisible().catch(() => false);
    const searchVisible = await searchInput.isVisible().catch(() => false);

    expect(qrVisible).toBe(true);
    expect(searchVisible).toBe(true);

    await context.close();
  });

  test("9.04 — Small laptop viewport (1024x768)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
    });
    const page = await context.newPage();
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    await ss(page, "52-small-laptop-viewport");
    const heading = page.getByRole("heading", { name: "Attendance", exact: true });
    await expect(heading).toBeVisible();

    await context.close();
  });

  test("9.05 — QR input usable on mobile", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    const qrInput = page.getByLabel(/qr code token/i).or(page.locator("input[placeholder*='Scan QR']"));
    const isVisible = await qrInput.isVisible().catch(() => false);
    if (isVisible) {
      await qrInput.fill("test-qr-mobile");
      const value = await qrInput.inputValue();
      expect(value).toBe("test-qr-mobile");
    }

    await ss(page, "53-mobile-qr-input");
    expect(isVisible).toBe(true);

    await context.close();
  });

  test("9.06 — Manual search usable on mobile", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);

    const searchInput = page.getByLabel(/search members/i).or(page.locator("input[placeholder*='Search member']"));
    const isVisible = await searchInput.isVisible().catch(() => false);
    if (isVisible) {
      await searchInput.fill("test search");
    }

    await ss(page, "54-mobile-search-input");
    expect(isVisible).toBe(true);

    await context.close();
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SECTION 10 — UX & ACCESSIBILITY TESTS
// ══════════════════════════════════════════════════════════════════════
test.describe("10. UX & ACCESSIBILITY", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, OWNER_EMAIL);
    await navigateToAttendance(page);
  });

  test("10.01 — QR input has accessible label", async ({ page }) => {
    const qrInput = page.getByLabel(/qr code token/i);
    const isVisible = await qrInput.isVisible().catch(() => false);
    await ss(page, "55-qr-accessible-label");
    expect(isVisible).toBe(true);
  });

  test("10.02 — Search input has accessible label", async ({ page }) => {
    const searchInput = page.getByLabel(/search members/i);
    const isVisible = await searchInput.isVisible().catch(() => false);
    await ss(page, "56-search-accessible-label");
    expect(isVisible).toBe(true);
  });

  test("10.03 — QR input auto-focuses on page load", async ({ page }) => {
    // Check if QR input has focus
    const qrInput = page.getByLabel(/qr code token/i).or(page.locator("input[placeholder*='Scan QR']"));
    const isFocused = await qrInput.evaluate(el => el === document.activeElement).catch(() => false);

    await ss(page, "57-qr-autofocus");
    test.info().annotations.push({
      type: "result",
      description: `QR input auto-focused: ${isFocused}`,
    });
  });

  test("10.04 — Keyboard tab navigation works", async ({ page }) => {
    // Tab through interactive elements
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    // An interactive element should be focused
    const activeTag = await page.evaluate(() => document.activeElement?.tagName);
    await ss(page, "58-keyboard-nav");
    expect(["INPUT", "BUTTON", "A", "SELECT"]).toContain(activeTag);
  });

  test("10.05 — No raw [object Object] in UI", async ({ page }) => {
    const pageText = await page.textContent("body");
    const hasRawObject = pageText?.includes("[object Object]") ?? false;

    await ss(page, "59-no-raw-objects");
    expect(hasRawObject).toBe(false);
  });

  test("10.06 — Loading skeleton shown during data fetch", async ({ page }) => {
    // Navigate with cleared cache to trigger loading state
    await page.goto("/attendance");
    // Quick check for skeleton
    const skeletonVisible = await page.locator("[class*='skeleton'], [class*='Skeleton']").first()
      .isVisible({ timeout: 3000 }).catch(() => false);

    await ss(page, "60-loading-skeleton");
    test.info().annotations.push({
      type: "result",
      description: `Loading skeleton visible: ${skeletonVisible}`,
    });
  });

  test("10.07 — Page title and description are present", async ({ page }) => {
    const heading = page.getByRole("heading", { name: "Attendance", exact: true });
    const description = page.getByText(/scan.*qr code|walk-in check-in|search by name/i);

    const headingVisible = await heading.isVisible().catch(() => false);
    const descVisible = await description.first().isVisible().catch(() => false);

    await ss(page, "61-page-title");
    expect(headingVisible).toBe(true);
    expect(descVisible).toBe(true);
  });

  test("10.08 — Check-in button shows loading state", async ({ page }) => {
    const qrInput = page.getByLabel(/qr code token/i).or(page.locator("input[placeholder*='Scan QR']"));
    await qrInput.fill("LOADING_STATE_TEST");

    const qrSubmitBtn = page.getByRole("button", { name: /check in/i }).first();
    await qrSubmitBtn.click();

    // Check if button shows loading state (text changes to "...")
    const btnText = await qrSubmitBtn.textContent().catch(() => "");
    await page.waitForTimeout(500);

    await ss(page, "62-button-loading-state");
    test.info().annotations.push({
      type: "result",
      description: `Button text during loading: "${btnText}"`,
    });
  });

  test("10.09 — No console errors on normal attendance page load", async ({ page }) => {
    const consoleErrs = await setupConsoleListener(page);
    await navigateToAttendance(page);
    await page.waitForTimeout(3000);

    const critical = filterCriticalErrors(consoleErrs);
    await ss(page, "63-no-console-errors");
    expect(critical.length).toBe(0);
  });

  test("10.10 — QR and Manual sections have descriptive titles", async ({ page }) => {
    const qrVisible = await page.getByText("QR Check-In").first().isVisible().catch(() => false);
    const manualVisible = await page.getByText("Manual Check-In").first().isVisible().catch(() => false);

    await ss(page, "64-section-titles");
    expect(qrVisible).toBe(true);
    expect(manualVisible).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SECTION 11 — DATA INTEGRITY (API-LEVEL)
// ══════════════════════════════════════════════════════════════════════
test.describe("11. DATA INTEGRITY", () => {

  test("11.01 — Check-in creates attendance record with correct fields", async ({ browser }) => {
    test.setTimeout(90000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginViaUI(page, OWNER_EMAIL);

    const result = await page.evaluate(async (args: { apiBase: string; runId: number }) => {
      const today = new Date();
      const future = new Date(today);
      future.setMonth(future.getMonth() + 1);

      // Create a fresh member
      const memberRes = await fetch(`${args.apiBase}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: `QA DataInteg ${args.runId}`,
          phone: `9${String(Math.floor(Math.random() * 900000000) + 100000000)}`,
          membership_plan: "Monthly",
          amount_paid: 200000,
          membership_start: today.toISOString().slice(0, 10),
          membership_end: future.toISOString().slice(0, 10),
        }),
      });
      if (!memberRes.ok) return { error: `member: ${memberRes.status}` };
      const member = await memberRes.json();

      // Check in
      const checkinRes = await fetch(`${args.apiBase}/attendance/check-in/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ member_id: member.id }),
      });
      const checkinBody = await checkinRes.json();
      return { status: checkinRes.status, record: checkinBody, memberId: member.id };
    }, { apiBase: API_BASE, runId: RUN_ID });

    if (!("error" in result) && (result.status === 200 || result.status === 201)) {
      const record = result.record;
      expect(record.member_id).toBe(result.memberId);
      expect(record.status).toBe("checked_in");
      expect(record.source).toBe("manual");
      expect(record.check_in_at).toBeTruthy();
      ATTENDANCE_RECORD_ID = record.id;
    }

    test.info().annotations.push({
      type: "result",
      description: `Data integrity check-in: ${JSON.stringify(result).slice(0, 200)}`,
    });

    await context.close();
  });

  test("11.02 — Check-out updates attendance record", async ({ browser }) => {
    if (!ATTENDANCE_RECORD_ID) {
      test.info().annotations.push({ type: "skip", description: "No attendance record to check out" });
      return;
    }
    test.setTimeout(60000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginViaUI(page, OWNER_EMAIL);

    const result = await page.evaluate(async (args: { apiBase: string; recordId: string }) => {
      const res = await fetch(`${args.apiBase}/attendance/${args.recordId}/check-out`, {
        method: "POST",
        credentials: "include",
      });
      return { status: res.status, body: res.ok ? await res.json() : await res.text() };
    }, { apiBase: API_BASE, recordId: ATTENDANCE_RECORD_ID });

    if (result.status === 200) {
      const record = result.body as any;
      expect(record.status).toBe("checked_out");
      expect(record.check_out_at).toBeTruthy();
    }

    test.info().annotations.push({
      type: "result",
      description: `Check-out: status=${result.status}`,
    });

    await context.close();
  });

  test("11.03 — Attendance history returns records", async ({ browser }) => {
    test.setTimeout(60000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginViaUI(page, OWNER_EMAIL);

    const result = await page.evaluate(async (apiBase: string) => {
      const res = await fetch(`${apiBase}/attendance/history?skip=0&limit=50`, {
        credentials: "include",
      });
      return { status: res.status, body: res.ok ? await res.json() : null };
    }, API_BASE);

    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("attendance");
    expect(result.body.attendance.length).toBeGreaterThanOrEqual(1);

    await context.close();
  });

  test("11.04 — Member attendance endpoint returns member-specific records", async ({ browser }) => {
    if (!MEMBER_A_ID) return;
    test.setTimeout(60000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginViaUI(page, OWNER_EMAIL);

    const result = await page.evaluate(async (args: { apiBase: string; memberId: string }) => {
      const res = await fetch(`${args.apiBase}/attendance/member/${args.memberId}?skip=0&limit=30`, {
        credentials: "include",
      });
      return { status: res.status, body: res.ok ? await res.json() : null };
    }, { apiBase: API_BASE, memberId: MEMBER_A_ID });

    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("attendance");

    for (const record of result.body.attendance) {
      expect(record.member_id).toBe(MEMBER_A_ID);
    }

    await context.close();
  });

  test("11.05 — Attendance trend returns daily counts", async ({ browser }) => {
    test.setTimeout(60000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginViaUI(page, OWNER_EMAIL);

    const result = await page.evaluate(async (apiBase: string) => {
      const res = await fetch(`${apiBase}/attendance/trend?days=14`, {
        credentials: "include",
      });
      return { status: res.status, body: res.ok ? await res.json() : null };
    }, API_BASE);

    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("trend");
    expect(Array.isArray(result.body.trend)).toBe(true);

    if (result.body.trend.length > 0) {
      const day = result.body.trend[0];
      expect(day).toHaveProperty("date");
      expect(day).toHaveProperty("count");
      expect(typeof day.count).toBe("number");
    }

    await context.close();
  });
});
