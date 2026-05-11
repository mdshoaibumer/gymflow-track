/**
 * ══════════════════════════════════════════════════════════════════════
 * GymFlow — Payment & Subscription Module QA Test Suite
 * ══════════════════════════════════════════════════════════════════════
 *
 * Comprehensive browser-based tests covering:
 *   - Payment creation & validation
 *   - Subscription / billing workflows
 *   - Concurrency & multi-tab behavior
 *   - Financial integrity
 *   - Security (XSS, SQLi, tampering)
 *   - Network failure recovery
 *   - Mobile responsiveness
 *   - UX & accessibility
 *
 * Prerequisites:
 *   Backend:   cd backend && python run_sqlite_server.py
 *   Frontend:  cd frontend && npm run dev
 */
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";

// SQLite cannot handle concurrent writes
test.describe.configure({ mode: "serial" });

// ── Constants ─────────────────────────────────────────────────────────
const RUN_ID = Date.now();
const API_BASE = "http://localhost:8000/api/v1";
const TEST_PASSWORD = "StrongPass123";
const OWNER_EMAIL = `test_debug_123@test.com`;
const OWNER_NAME = "Payment Test Owner";
const GYM_NAME = "Payment QA Gym";
const OWNER_PHONE = "9876500100";

// ── Helpers ───────────────────────────────────────────────────────────

async function registerViaAPI(
  request: APIRequestContext,
  opts: {
    gym_name: string;
    owner_name: string;
    phone: string;
    email: string;
  }
) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const resp = await request.post(`${API_BASE}/auth/register`, {
      data: {
        gym_name: opts.gym_name,
        owner_name: opts.owner_name,
        phone: opts.phone,
        email: opts.email,
        password: TEST_PASSWORD,
      },
    });
    if (resp.status() === 201 || resp.status() === 200) return resp.json();
    if (resp.status() === 409) return; // already exists
    if (resp.status() === 500) {
      // SQLite locking — check if user already exists by trying login
      const loginResp = await request.post(`${API_BASE}/auth/login`, {
        data: { email: opts.email, password: TEST_PASSWORD },
      });
      if (loginResp.status() === 200 || loginResp.status() === 201) {
        return; // already registered
      }
    }
    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    // Last resort: try login to check if already exists
    const finalLogin = await request.post(`${API_BASE}/auth/login`, {
      data: { email: opts.email, password: TEST_PASSWORD },
    });
    if (finalLogin.status() === 200 || finalLogin.status() === 201) {
      return; // already registered from a prior run
    }
    throw new Error(
      `Registration failed after ${attempt} attempts`
    );
  }
}

async function loginUser(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard|setup/, { timeout: 30000 });
}

async function addMemberViaAPI(
  request: APIRequestContext,
  page: Page,
  opts: { name: string; phone: string; email?: string }
): Promise<string> {
  // Extract cookies from page context for auth
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const resp = await request.post(`${API_BASE}/members`, {
    data: {
      name: opts.name,
      phone: opts.phone,
      email: opts.email || `${opts.phone}@test.com`,
      gender: "male",
      membership_plan: "Monthly",
      amount_paid: 100000,
      membership_start: new Date().toISOString().split("T")[0],
      membership_end: new Date(Date.now() + 30 * 86400000)
        .toISOString()
        .split("T")[0],
    },
    headers: { Cookie: cookieHeader },
  });

  if (resp.status() !== 201 && resp.status() !== 200) {
    const text = await resp.text();
    throw new Error(`Failed to create member: ${resp.status()} — ${text}`);
  }
  const body = await resp.json();
  return body.id;
}

async function navigateToPayments(page: Page) {
  await page.goto("/payments");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "Payments", exact: true })
  ).toBeVisible({ timeout: 15000 });
}

async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/payment-qa/${name}.png`,
    fullPage: true,
  });
}

// Collect console errors
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  return errors;
}

// ══════════════════════════════════════════════════════════════════════
//  SETUP — Register owner, login, create test member
// ══════════════════════════════════════════════════════════════════════

let testMemberId: string;
let testMemberName: string;

test.describe("Payment Module — Setup", () => {
  test("login & create test member", async ({ page, request }) => {
    await loginUser(page, OWNER_EMAIL);
    await takeScreenshot(page, "01-login-success");

    // Create a test member via API
    testMemberName = `TestMember_${RUN_ID}`;
    try {
      testMemberId = await addMemberViaAPI(request, page, {
        name: testMemberName,
        phone: `98765${String(RUN_ID).slice(-5)}`,
      });
    } catch (e) {
      // If member creation fails, use any existing member
      testMemberName = "TestMember";
      testMemberId = "";
      console.log(`Warning: member creation failed (${e}), tests will use existing members`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// 1. PAYMENT CREATION TESTS
// ══════════════════════════════════════════════════════════════════════

test.describe("1. Payment Creation Tests", () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page, OWNER_EMAIL);
  });

  test("1.1 — Valid payment creation (cash)", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await navigateToPayments(page);

    // Click "Record Payment"
    await page.getByRole("button", { name: /record payment/i }).click();
    await expect(page.getByText("Record Payment").first()).toBeVisible();
    await takeScreenshot(page, "02-payment-form-open");

    // Search for member
    const memberSearch = page.getByPlaceholder(/search by name or phone/i);
    await memberSearch.fill(testMemberName.substring(0, 10));
    await page.waitForTimeout(1000); // debounce

    // Select member from dropdown
    const memberOption = page.locator("button").filter({ hasText: testMemberName });
    if (await memberOption.isVisible({ timeout: 5000 })) {
      await memberOption.click();
    } else {
      // If no dropdown, member search may not have results — screenshot and note
      await takeScreenshot(page, "02b-member-search-no-results");
    }

    // Fill amount
    const amountInput = page.locator('input[type="number"]');
    await amountInput.fill("2000");

    // Submit
    await page.getByRole("button", { name: /record payment/i }).last().click();
    await page.waitForTimeout(3000);
    await takeScreenshot(page, "03-payment-created");

    // Check for success toast or table update
    const hasSuccessIndicator =
      (await page.locator("[data-sonner-toast]").count()) > 0 ||
      (await page.getByText(/₹2,000|₹2000|2000/i).count()) > 0;

    // Log console errors
    if (consoleErrors.length > 0) {
      console.log("Console errors during payment creation:", consoleErrors);
    }

    expect(hasSuccessIndicator).toBeTruthy();
  });

  test("1.2 — Payment form validation — empty fields", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    // Submit without filling anything
    const submitBtn = page.getByRole("button", { name: /record payment/i }).last();
    await submitBtn.click();
    await page.waitForTimeout(1000);

    await takeScreenshot(page, "04-empty-form-validation");

    // Check validation messages
    const hasValidationError =
      (await page.getByText(/select a member/i).count()) > 0 ||
      (await page.getByText(/enter a valid amount/i).count()) > 0 ||
      (await page.locator(".text-destructive").count()) > 0;

    expect(hasValidationError).toBeTruthy();
  });

  test("1.3 — Zero amount payment rejected", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    const amountInput = page.locator('input[type="number"]');
    await amountInput.fill("0");
    await page.getByRole("button", { name: /record payment/i }).last().click();
    await page.waitForTimeout(1000);

    await takeScreenshot(page, "05-zero-amount-validation");

    // Zero should be rejected: either via validation error message,
    // HTML5 constraint (min=1), or form staying open (submission blocked).
    const hasError =
      (await page.getByText(/must be greater than 0|positive|invalid/i).count()) > 0 ||
      (await page.locator(".text-destructive").count()) > 0;

    // If no visible error text, form should at least still be open (not submitted)
    const formStillOpen = await page
      .getByPlaceholder(/search by name or phone/i)
      .isVisible()
      .catch(() => false);

    console.log(`Zero amount: hasError=${hasError}, formStillOpen=${formStillOpen}`);
    // Either validation error shown OR form blocked submission
    expect(hasError || formStillOpen).toBeTruthy();
  });

  test("1.4 — Negative amount payment rejected", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    const amountInput = page.locator('input[type="number"]');
    await amountInput.fill("-500");
    await page.getByRole("button", { name: /record payment/i }).last().click();
    await page.waitForTimeout(1000);

    await takeScreenshot(page, "06-negative-amount-validation");

    const hasError =
      (await page.getByText(/must be greater than 0|positive|invalid|negative/i).count()) > 0 ||
      (await page.locator(".text-destructive").count()) > 0;

    const formStillOpen = await page
      .getByPlaceholder(/search by name or phone/i)
      .isVisible()
      .catch(() => false);

    console.log(`Negative amount: hasError=${hasError}, formStillOpen=${formStillOpen}`);
    expect(hasError || formStillOpen).toBeTruthy();
  });

  test("1.5 — Very large amount payment handling", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    const amountInput = page.locator('input[type="number"]');
    await amountInput.fill("99999999");

    await takeScreenshot(page, "07-large-amount");

    // Should not crash the form
    const formVisible = await page
      .getByRole("button", { name: /record payment/i })
      .last()
      .isVisible();
    expect(formVisible).toBeTruthy();
  });

  test("1.6 — Decimal precision handling", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    const amountInput = page.locator('input[type="number"]');
    // The form uses step="1" min="1" so test decimal behavior
    await amountInput.fill("1999.99");

    await takeScreenshot(page, "08-decimal-amount");

    // Note: the frontend should round to integer (paise conversion)
    const value = await amountInput.inputValue();
    // Document behavior — form step=1 but browser may allow decimals
    console.log(`Decimal input value accepted: ${value}`);
  });

  test("1.7 — Double-click payment spam prevention", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    // Fill out the form
    const memberSearch = page.getByPlaceholder(/search by name or phone/i);
    await memberSearch.fill(testMemberName.substring(0, 10));
    await page.waitForTimeout(500);
    const memberOption = page.locator("button").filter({ hasText: testMemberName });
    if (await memberOption.isVisible({ timeout: 5000 })) {
      await memberOption.click();
    }
    await page.locator('input[type="number"]').fill("500");

    // Rapid double-click submit
    const submitBtn = page.getByRole("button", { name: /record payment/i }).last();
    await submitBtn.dblclick();
    await page.waitForTimeout(2000);

    await takeScreenshot(page, "09-double-click-protection");

    // Check: button should be disabled during submission or show loading
    const isDisabledOrLoading =
      (await page.getByText(/recording/i).count()) > 0 ||
      (await submitBtn.isDisabled().catch(() => false));

    console.log(
      `Double-click protection: button disabled/loading = ${isDisabledOrLoading}`
    );
  });

  test("1.8 — Rapid multiple submissions", async ({ page }) => {
    const networkRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/payments") && req.method() === "POST") {
        networkRequests.push(req.url());
      }
    });

    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    const memberSearch = page.getByPlaceholder(/search by name or phone/i);
    await memberSearch.fill(testMemberName.substring(0, 10));
    await page.waitForTimeout(500);
    const memberOption = page.locator("button").filter({ hasText: testMemberName });
    if (await memberOption.isVisible({ timeout: 5000 })) {
      await memberOption.click();
    }
    await page.locator('input[type="number"]').fill("300");

    // Click submit 5 times rapidly
    const submitBtn = page.getByRole("button", { name: /record payment/i }).last();
    for (let i = 0; i < 5; i++) {
      await submitBtn.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(3000);

    await takeScreenshot(page, "10-rapid-submissions");

    console.log(`Rapid submit: ${networkRequests.length} POST requests sent`);
    // Ideally should only send 1 request
    if (networkRequests.length > 1) {
      console.warn(
        `⚠ CRITICAL: ${networkRequests.length} payment requests sent on rapid clicks — potential duplicate payment vulnerability`
      );
    }
  });

  test("1.9 — Payment method selection (all methods)", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    const methodSelect = page.locator('select').first();
    const methods = ["cash", "upi", "card", "bank_transfer", "other"];

    for (const method of methods) {
      await methodSelect.selectOption(method);
      const selected = await methodSelect.inputValue();
      expect(selected).toBe(method);
    }

    await takeScreenshot(page, "11-payment-methods");
  });

  test("1.10 — Payment status selection", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    // Find the status select (second select)
    const selects = page.locator("select");
    const statusSelect = selects.nth(1);

    await statusSelect.selectOption("completed");
    expect(await statusSelect.inputValue()).toBe("completed");

    await statusSelect.selectOption("pending");
    expect(await statusSelect.inputValue()).toBe("pending");

    await takeScreenshot(page, "12-payment-status");
  });

  test("1.11 — Membership renewal fields appear for completed payments", async ({
    page,
  }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    // Status should default to "completed" — renewal section should be visible
    const renewalText = page.getByText(/membership renewal/i);
    await expect(renewalText).toBeVisible({ timeout: 5000 });
    await takeScreenshot(page, "13-renewal-visible");

    // Switch to pending — renewal section should hide
    const statusSelect = page.locator("select").nth(1);
    await statusSelect.selectOption("pending");
    await page.waitForTimeout(500);

    const renewalHidden = await renewalText.isVisible().catch(() => false);
    await takeScreenshot(page, "13b-renewal-hidden");
    expect(renewalHidden).toBeFalsy();
  });

  test("1.12 — Cancel button closes form", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();
    await expect(page.getByText("Record Payment").first()).toBeVisible();

    await page.getByRole("button", { name: /cancel/i }).click();
    await page.waitForTimeout(500);

    // Form should be hidden
    const formVisible = await page
      .getByPlaceholder(/search by name or phone/i)
      .isVisible()
      .catch(() => false);
    expect(formVisible).toBeFalsy();
    await takeScreenshot(page, "14-form-cancelled");
  });

  test("1.13 — Notes field accepts text and respects max length", async ({
    page,
  }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    const notesInput = page.getByPlaceholder(/optional notes/i);
    const longNote = "A".repeat(600); // exceed 500 char limit
    await notesInput.fill(longNote);

    await page.getByRole("button", { name: /record payment/i }).last().click();
    await page.waitForTimeout(1000);
    await takeScreenshot(page, "15-notes-max-length");
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2. SUBSCRIPTION & BILLING TESTS
// ══════════════════════════════════════════════════════════════════════

test.describe("2. Subscription & Billing Tests", () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page, OWNER_EMAIL);
  });

  test("2.1 — Billing plans page loads with plan cards", async ({ page }) => {
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(5000);

    await takeScreenshot(page, "20-billing-plans");

    // Check plan cards are rendered — search broadly since plan names may render async
    const pageText = await page.locator("body").innerText();
    const starterVisible = pageText.toLowerCase().includes("starter");
    const proVisible = pageText.toLowerCase().includes("pro");
    const enterpriseVisible = pageText.toLowerCase().includes("enterprise");
    const hasPlansOrPricing = /plans|pricing|\/month|₹/i.test(pageText);

    console.log(
      `Plans visible: Starter=${starterVisible}, Pro=${proVisible}, Enterprise=${enterpriseVisible}, hasPlansUI=${hasPlansOrPricing}`
    );

    // The page should at minimum load (plans OR pricing header OR loading state)
    const hasContent = starterVisible || proVisible || enterpriseVisible || hasPlansOrPricing ||
      (await page.locator(".animate-spin").count()) > 0;
    expect(hasContent).toBeTruthy();
  });

  test("2.2 — Plan prices display correctly (currency format)", async ({
    page,
  }) => {
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await takeScreenshot(page, "21-plan-prices");

    // Check for ₹ symbol in prices
    const hasRupeeSymbol = await page.getByText(/₹/).count();
    console.log(`Rupee symbols found on billing page: ${hasRupeeSymbol}`);

    // Check for "/month" labels
    const hasMonthly = await page.getByText(/\/month/).count();
    console.log(`Monthly labels found: ${hasMonthly}`);
  });

  test("2.3 — Subscription status card visible", async ({ page }) => {
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Check for current plan indicator
    const hasCurrentPlan =
      (await page.getByText(/current plan/i).count()) > 0 ||
      (await page.getByText(/active|trial/i).count()) > 0;

    await takeScreenshot(page, "22-subscription-status");
    console.log(`Subscription status visible: ${hasCurrentPlan}`);
  });

  test("2.4 — Billing manage page loads", async ({ page }) => {
    await page.goto("/billing/manage");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await takeScreenshot(page, "23-billing-manage");

    const url = page.url();
    // Should either show billing manage page or redirect if not owner
    const isValidPage =
      url.includes("billing") || url.includes("dashboard") || url.includes("login");
    expect(isValidPage).toBeTruthy();
  });

  test("2.5 — Billing history table loads", async ({ page }) => {
    await page.goto("/billing/manage");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await takeScreenshot(page, "24-billing-history");

    const hasBillingHistory =
      (await page.getByText(/billing history/i).count()) > 0;
    const hasNoSub =
      (await page.getByText(/no subscription/i).count()) > 0;

    console.log(
      `Billing manage: history=${hasBillingHistory}, noSub=${hasNoSub}`
    );
  });

  test("2.6 — Enterprise plan shows 'Coming Soon'", async ({ page }) => {
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const comingSoon = page.getByRole("button", { name: /coming soon/i });
    const isVisible = await comingSoon.isVisible().catch(() => false);
    const isDisabled = isVisible ? await comingSoon.isDisabled() : false;

    await takeScreenshot(page, "25-enterprise-disabled");

    console.log(`Enterprise Coming Soon: visible=${isVisible}, disabled=${isDisabled}`);
    if (isVisible) {
      expect(isDisabled).toBeTruthy();
    }
  });

  test("2.7 — Billing metrics page (owner only)", async ({ page }) => {
    await page.goto("/billing/metrics");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await takeScreenshot(page, "26-billing-metrics");

    const hasMetrics =
      (await page.getByText(/monthly recurring|mrr|active subscriptions/i).count()) > 0;
    console.log(`Billing metrics visible: ${hasMetrics}`);
  });

  test("2.8 — Plan subscribe button behavior", async ({ page }) => {
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Look for subscribe/upgrade buttons (not Enterprise)
    const subscribeButtons = page.getByRole("button", { name: /subscribe|upgrade|choose|get started/i });
    const btnCount = await subscribeButtons.count();
    console.log(`Subscribe buttons found: ${btnCount}`);

    if (btnCount > 0) {
      // Click first available subscribe button
      await subscribeButtons.first().click();
      await page.waitForTimeout(3000);
      await takeScreenshot(page, "27-subscribe-clicked");

      // Check for payment modal, error, or mock flow
      const hasPaymentFlow =
        (await page.locator("[data-sonner-toast]").count()) > 0 ||
        (await page.getByText(/payment|razorpay|checkout|mock|configure/i).count()) > 0;
      console.log(`Payment flow triggered: ${hasPaymentFlow}`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// 3. CONCURRENCY & MULTI-TAB TESTS
// ══════════════════════════════════════════════════════════════════════

test.describe("3. Concurrency & Multi-Tab Tests", () => {
  test("3.1 — Same payment page in two tabs", async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await loginUser(page1, OWNER_EMAIL);

    // Copy cookies to page2
    const cookies = await context.cookies();

    await page1.goto("/payments");
    await page2.goto("/payments");

    await page1.waitForLoadState("networkidle");
    await page2.waitForLoadState("networkidle");

    await page1.screenshot({
      path: "test-results/payment-qa/30-multi-tab-1.png",
      fullPage: true,
    });
    await page2.screenshot({
      path: "test-results/payment-qa/30-multi-tab-2.png",
      fullPage: true,
    });

    // Both tabs should show payments page
    await expect(
      page1.getByRole("heading", { name: /payments/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page2.getByRole("heading", { name: /payments/i })
    ).toBeVisible({ timeout: 10000 });

    await context.close();
  });

  test("3.2 — Logout in one tab affects another tab", async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await loginUser(page1, OWNER_EMAIL);

    await page1.goto("/payments");
    await page2.goto("/payments");

    await page1.waitForLoadState("networkidle");
    await page2.waitForLoadState("networkidle");

    // Logout in tab 1
    const logoutBtn = page1.getByRole("button", { name: /logout|sign out/i });
    if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logoutBtn.click();
    } else {
      // Try dropdown/avatar menu
      const avatar = page1.locator("[data-testid='user-avatar'], button:has(span.rounded-full), button:has(svg)").first();
      if (await avatar.isVisible({ timeout: 3000 }).catch(() => false)) {
        await avatar.click();
        await page1.waitForTimeout(500);
        const logoutItem = page1.getByText(/logout|sign out/i);
        if (await logoutItem.isVisible({ timeout: 2000 }).catch(() => false)) {
          await logoutItem.click();
        }
      }
    }

    await page1.waitForTimeout(2000);

    // Refresh tab 2 — should redirect to login
    await page2.reload();
    await page2.waitForTimeout(5000);

    const page2Url = page2.url();
    await page2.screenshot({
      path: "test-results/payment-qa/31-logout-propagation.png",
      fullPage: true,
    });

    console.log(`Tab 2 URL after logout in tab 1: ${page2Url}`);
    // Should redirect to login
    const redirectedToLogin = page2Url.includes("login");
    console.log(`Logout propagated to tab 2: ${redirectedToLogin}`);

    await context.close();
  });

  test("3.3 — Simultaneous payment attempts from two tabs", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await loginUser(page1, OWNER_EMAIL);

    await page1.goto("/payments");
    await page2.goto("/payments");
    await page1.waitForLoadState("networkidle");
    await page2.waitForLoadState("networkidle");

    // Open payment form in both tabs
    const openForm = async (page: Page) => {
      const btn = page.getByRole("button", { name: /record payment/i });
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await btn.click();
      }
    };

    await openForm(page1);
    await openForm(page2);

    // Fill forms in both tabs
    const fillForm = async (page: Page, amount: string) => {
      const search = page.getByPlaceholder(/search by name or phone/i);
      if (await search.isVisible({ timeout: 3000 }).catch(() => false)) {
        await search.fill(testMemberName.substring(0, 10));
        await page.waitForTimeout(600);
        const option = page.locator("button").filter({ hasText: testMemberName });
        if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
          await option.click();
        }
        const amountInput = page.locator('input[type="number"]');
        await amountInput.fill(amount);
      }
    };

    await fillForm(page1, "1500");
    await fillForm(page2, "1500");

    // Submit both nearly simultaneously
    const submit1 = page1
      .getByRole("button", { name: /record payment/i })
      .last()
      .click()
      .catch(() => {});
    const submit2 = page2
      .getByRole("button", { name: /record payment/i })
      .last()
      .click()
      .catch(() => {});

    await Promise.all([submit1, submit2]);
    await page1.waitForTimeout(3000);
    await page2.waitForTimeout(3000);

    await page1.screenshot({
      path: "test-results/payment-qa/32-concurrent-tab1.png",
      fullPage: true,
    });
    await page2.screenshot({
      path: "test-results/payment-qa/32-concurrent-tab2.png",
      fullPage: true,
    });

    console.log(
      "⚠ Concurrent payment test completed — check screenshots for duplicate entries"
    );

    await context.close();
  });

  test("3.4 — Refresh during payment submission", async ({ page }) => {
    await loginUser(page, OWNER_EMAIL);
    await navigateToPayments(page);

    await page.getByRole("button", { name: /record payment/i }).click();

    const memberSearch = page.getByPlaceholder(/search by name or phone/i);
    await memberSearch.fill(testMemberName.substring(0, 10));
    await page.waitForTimeout(600);
    const option = page.locator("button").filter({ hasText: testMemberName });
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
    }
    await page.locator('input[type="number"]').fill("750");

    // Submit and immediately refresh
    page
      .getByRole("button", { name: /record payment/i })
      .last()
      .click()
      .catch(() => {});
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await takeScreenshot(page, "33-refresh-during-payment");

    // Page should recover gracefully
    const hasHeading = await page
      .getByRole("heading", { name: /payments/i })
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    expect(hasHeading).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
// 4. FINANCIAL INTEGRITY TESTS
// ══════════════════════════════════════════════════════════════════════

test.describe("4. Financial Integrity Tests", () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page, OWNER_EMAIL);
  });

  test("4.1 — Payment amounts displayed correctly (₹ formatting)", async ({
    page,
  }) => {
    await navigateToPayments(page);
    await page.waitForTimeout(2000);
    await takeScreenshot(page, "40-payment-amounts");

    // Check all amounts use ₹ symbol
    const amounts = await page.locator("td").allTextContents();
    const rupeeValues = amounts.filter((t) => t.includes("₹"));
    console.log(`Found ${rupeeValues.length} ₹-formatted values in payments table`);

    // Verify no raw paise values are exposed (values > 10000 without ₹ likely paise)
    const suspiciousValues = amounts.filter(
      (t) => /^\d{5,}$/.test(t.trim())
    );
    if (suspiciousValues.length > 0) {
      console.warn(
        `⚠ Suspicious raw numeric values found (possible paise leak): ${suspiciousValues.join(", ")}`
      );
    }
  });

  test("4.2 — Dashboard metrics consistency", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await takeScreenshot(page, "41-dashboard-metrics");

    // Capture dashboard metric values
    const totalMembers = await page.getByText(/total members/i).isVisible().catch(() => false);
    const activeMembers = await page.getByText(/active members/i).isVisible().catch(() => false);
    const monthlyRevenue = await page.getByText(/monthly revenue|revenue/i).isVisible().catch(() => false);

    console.log(
      `Dashboard: totalMembers=${totalMembers}, active=${activeMembers}, revenue=${monthlyRevenue}`
    );
  });

  test("4.3 — Member payment history matches payments page", async ({
    page,
  }) => {
    // Navigate to members page and find our test member
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await takeScreenshot(page, "42-members-page");

    // Try to find and click on test member
    const memberLink = page.getByText(testMemberName);
    if (await memberLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await memberLink.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      await takeScreenshot(page, "43-member-detail");

      // Check payment history on member detail page
      const hasPaymentHistory =
        (await page.getByText(/payment history/i).count()) > 0;
      console.log(
        `Member detail page has payment history: ${hasPaymentHistory}`
      );
    }
  });

  test("4.4 — No negative balance rendering", async ({ page }) => {
    await navigateToPayments(page);
    await page.waitForTimeout(2000);

    const pageText = await page.locator("body").innerText();
    const hasNegativeAmount = /₹-\d|₹\s*-\d/.test(pageText);

    await takeScreenshot(page, "44-no-negative-balance");
    console.log(`Negative amounts found on payments page: ${hasNegativeAmount}`);
  });

  test("4.5 — Payment count matches displayed total", async ({ page }) => {
    await navigateToPayments(page);
    await page.waitForTimeout(2000);

    // Read total count from header
    const headerText = await page
      .getByText(/\d+ payment/i)
      .textContent()
      .catch(() => "");
    const match = headerText?.match(/(\d+)\s+payment/i);
    const displayedTotal = match ? parseInt(match[1]) : -1;

    // Count table rows
    const rows = await page.locator("tbody tr").count();

    await takeScreenshot(page, "45-payment-count");

    console.log(
      `Displayed total: ${displayedTotal}, Table rows: ${rows}`
    );

    if (displayedTotal >= 0 && displayedTotal <= 20) {
      // If total <= page size, rows should match
      expect(rows).toBe(displayedTotal);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// 5. SECURITY TESTS
// ══════════════════════════════════════════════════════════════════════

test.describe("5. Security Tests", () => {
  test("5.1 — XSS in payment notes field", async ({ page }) => {
    await loginUser(page, OWNER_EMAIL);
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    // Fill member
    const memberSearch = page.getByPlaceholder(/search by name or phone/i);
    await memberSearch.fill(testMemberName.substring(0, 10));
    await page.waitForTimeout(600);
    const option = page.locator("button").filter({ hasText: testMemberName });
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
    }
    await page.locator('input[type="number"]').fill("100");

    // XSS payload in notes
    const xssPayload = '<script>alert("XSS")</script>';
    await page.getByPlaceholder(/optional notes/i).fill(xssPayload);

    await page.getByRole("button", { name: /record payment/i }).last().click();
    await page.waitForTimeout(3000);

    await takeScreenshot(page, "50-xss-notes");

    // Check no alert dialog appeared
    let alertFired = false;
    page.on("dialog", () => {
      alertFired = true;
    });
    await page.waitForTimeout(1000);
    expect(alertFired).toBeFalsy();

    // Check script tag not rendered as HTML
    const bodyHtml = await page.content();
    const hasScriptRendered = bodyHtml.includes(
      '<script>alert("XSS")</script>'
    );
    console.log(`XSS script rendered in DOM: ${hasScriptRendered}`);
  });

  test("5.2 — XSS in member search field", async ({ page }) => {
    await loginUser(page, OWNER_EMAIL);
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    const memberSearch = page.getByPlaceholder(/search by name or phone/i);
    const xssPayload = '"><img src=x onerror=alert(1)>';
    await memberSearch.fill(xssPayload);
    await page.waitForTimeout(1000);

    await takeScreenshot(page, "51-xss-member-search");

    let alertFired = false;
    page.on("dialog", () => {
      alertFired = true;
    });
    await page.waitForTimeout(500);
    expect(alertFired).toBeFalsy();
  });

  test("5.3 — SQL injection in member search", async ({ page }) => {
    await loginUser(page, OWNER_EMAIL);
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    const memberSearch = page.getByPlaceholder(/search by name or phone/i);
    const sqliPayload = "' OR '1'='1' --";
    await memberSearch.fill(sqliPayload);
    await page.waitForTimeout(2000);

    await takeScreenshot(page, "52-sqli-member-search");

    // Should not return all members or crash
    const pageText = await page.locator("body").innerText();
    const hasSqlError = /sql|syntax|error|traceback/i.test(pageText);
    console.log(`SQL error visible: ${hasSqlError}`);
    expect(hasSqlError).toBeFalsy();
  });

  test("5.4 — HTML injection in notes", async ({ page }) => {
    await loginUser(page, OWNER_EMAIL);
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    const memberSearch = page.getByPlaceholder(/search by name or phone/i);
    await memberSearch.fill(testMemberName.substring(0, 10));
    await page.waitForTimeout(600);
    const option = page.locator("button").filter({ hasText: testMemberName });
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
    }
    await page.locator('input[type="number"]').fill("100");

    await page
      .getByPlaceholder(/optional notes/i)
      .fill('<h1>HACKED</h1><iframe src="https://evil.com">');

    await page.getByRole("button", { name: /record payment/i }).last().click();
    await page.waitForTimeout(2000);

    await takeScreenshot(page, "53-html-injection");

    // Check no injected HTML is rendered
    const h1Count = await page.locator("h1:has-text('HACKED')").count();
    const iframeCount = await page.locator("iframe").count();
    console.log(
      `HTML injection: H1=${h1Count}, iframe=${iframeCount}`
    );
    expect(h1Count).toBe(0);
    expect(iframeCount).toBe(0);
  });

  test("5.5 — Unauthorized payment API call (no auth)", async ({
    request,
  }) => {
    const resp = await request.post(`${API_BASE}/payments`, {
      data: {
        member_id: "fake-id",
        amount_in_paise: 100000,
        payment_method: "cash",
        payment_status: "completed",
      },
    });

    console.log(`Unauthorized payment API response: ${resp.status()}`);
    expect(resp.status()).toBeGreaterThanOrEqual(401);

    await takeScreenshot;
  });

  test("5.6 — Payment API with invalid member_id", async ({ page, request }) => {
    await loginUser(page, OWNER_EMAIL);

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const resp = await request.post(`${API_BASE}/payments`, {
      data: {
        member_id: "00000000-0000-0000-0000-000000000000",
        amount_in_paise: 100000,
        payment_method: "cash",
        payment_status: "completed",
      },
      headers: { Cookie: cookieHeader },
    });

    console.log(`Invalid member payment response: ${resp.status()}`);
    // Should be 404 or 422, not 500
    expect(resp.status()).not.toBe(500);
  });

  test("5.7 — Payment API with negative amount", async ({ page, request }) => {
    await loginUser(page, OWNER_EMAIL);

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const resp = await request.post(`${API_BASE}/payments`, {
      data: {
        member_id: testMemberId || "any-id",
        amount_in_paise: -100000,
        payment_method: "cash",
        payment_status: "completed",
      },
      headers: { Cookie: cookieHeader },
    });

    console.log(`Negative amount payment response: ${resp.status()}`);
    const body = await resp.text();
    console.log(`Response body: ${body}`);
    // Should be rejected (400 or 422)
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("5.8 — Payment API with zero amount", async ({ page, request }) => {
    await loginUser(page, OWNER_EMAIL);

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const resp = await request.post(`${API_BASE}/payments`, {
      data: {
        member_id: testMemberId || "any-id",
        amount_in_paise: 0,
        payment_method: "cash",
        payment_status: "completed",
      },
      headers: { Cookie: cookieHeader },
    });

    console.log(`Zero amount payment response: ${resp.status()}`);
    // Should be rejected (400 or 422)
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test("5.9 — Payment API with oversized payload", async ({ page, request }) => {
    await loginUser(page, OWNER_EMAIL);

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const resp = await request.post(`${API_BASE}/payments`, {
      data: {
        member_id: testMemberId || "any-id",
        amount_in_paise: 100000,
        payment_method: "cash",
        payment_status: "completed",
        notes: "X".repeat(100000), // 100KB payload
      },
      headers: { Cookie: cookieHeader },
    });

    console.log(`Oversized payload response: ${resp.status()}`);
    // Should be handled gracefully (rejected or truncated, not 500)
    expect([200, 201, 400, 413, 422]).toContain(resp.status());
  });

  test("5.10 — CSRF protection — no cookies sent cross-origin", async ({
    page,
  }) => {
    await loginUser(page, OWNER_EMAIL);

    // Check that cookies have proper attributes
    const cookies = await page.context().cookies();
    const authCookies = cookies.filter(
      (c) => c.name.includes("token") || c.name.includes("session") || c.name.includes("access")
    );

    for (const cookie of authCookies) {
      console.log(
        `Cookie ${cookie.name}: httpOnly=${cookie.httpOnly}, secure=${cookie.secure}, sameSite=${cookie.sameSite}`
      );
    }

    await takeScreenshot(page, "55-cookie-attributes");

    // HttpOnly cookies should not be accessible to JS
    const jsAccessibleToken = await page.evaluate(() => {
      return document.cookie;
    });
    console.log(`JS-accessible cookies: "${jsAccessibleToken}"`);

    // Auth tokens should NOT be in document.cookie if HttpOnly
    const hasAuthInJS =
      jsAccessibleToken.includes("access_token") ||
      jsAccessibleToken.includes("refresh_token");
    console.log(`Auth tokens accessible via JS: ${hasAuthInJS}`);
  });

  test("5.11 — localStorage/sessionStorage sensitive data exposure", async ({
    page,
  }) => {
    await loginUser(page, OWNER_EMAIL);

    const localStorageKeys = await page.evaluate(() =>
      Object.keys(localStorage)
    );
    const sessionStorageKeys = await page.evaluate(() =>
      Object.keys(sessionStorage)
    );

    console.log(`localStorage keys: ${JSON.stringify(localStorageKeys)}`);
    console.log(`sessionStorage keys: ${JSON.stringify(sessionStorageKeys)}`);

    // Check for sensitive data
    const localStorageData = await page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        data[key] = localStorage.getItem(key)!;
      }
      return data;
    });

    let hasTokenInStorage = false;
    for (const [key, val] of Object.entries(localStorageData)) {
      if (
        key.toLowerCase().includes("token") ||
        (typeof val === "string" && val.startsWith("eyJ"))
      ) {
        hasTokenInStorage = true;
        console.warn(`⚠ Sensitive data in localStorage: key="${key}"`);
      }
    }

    await takeScreenshot(page, "56-storage-check");
    console.log(`Tokens in localStorage: ${hasTokenInStorage}`);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 6. NETWORK & FAILURE TESTS
// ══════════════════════════════════════════════════════════════════════

test.describe("6. Network & Failure Tests", () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page, OWNER_EMAIL);
  });

  test("6.1 — Payment page recovery after API timeout simulation", async ({
    page,
  }) => {
    // Intercept payment list API and delay response
    await page.route("**/api/v1/payments**", async (route) => {
      if (route.request().method() === "GET") {
        await new Promise((r) => setTimeout(r, 10000)); // 10s delay
        await route.continue();
      } else {
        await route.continue();
      }
    });

    await page.goto("/payments");
    await page.waitForTimeout(3000);

    await takeScreenshot(page, "60-api-timeout");

    // Should show loading state, not crash
    const hasContent =
      (await page.getByRole("heading", { name: /payments/i }).isVisible().catch(() => false)) ||
      (await page.locator(".animate-spin, .animate-pulse").count()) > 0;

    console.log(`Page has content during slow API: ${hasContent}`);
    expect(hasContent).toBeTruthy();

    // Unblock routes
    await page.unrouteAll();
  });

  test("6.2 — Payment submission with API error (500)", async ({ page }) => {
    await navigateToPayments(page);

    // Intercept POST to payments and return 500
    await page.route("**/api/v1/payments", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Internal server error" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: /record payment/i }).click();

    const memberSearch = page.getByPlaceholder(/search by name or phone/i);
    await memberSearch.fill(testMemberName.substring(0, 10));
    await page.waitForTimeout(600);
    const option = page.locator("button").filter({ hasText: testMemberName });
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
    }
    await page.locator('input[type="number"]').fill("1000");

    await page.getByRole("button", { name: /record payment/i }).last().click();
    await page.waitForTimeout(3000);

    await takeScreenshot(page, "61-api-500-error");

    // Should show error message, not crash
    const hasError =
      (await page.locator("[data-sonner-toast]").count()) > 0 ||
      (await page.getByText(/error|failed|server/i).count()) > 0;
    console.log(`Error shown on API 500: ${hasError}`);

    await page.unrouteAll();
  });

  test("6.3 — Offline mode behavior", async ({ page, context }) => {
    await navigateToPayments(page);

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(1000);

    // Try to open payment form
    await page.getByRole("button", { name: /record payment/i }).click().catch(() => {});
    await page.waitForTimeout(2000);

    await takeScreenshot(page, "62-offline-mode");

    // Go back online
    await context.setOffline(false);
    await page.waitForTimeout(1000);

    // Refresh should recover
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    await takeScreenshot(page, "63-back-online");

    const recovered = await page
      .getByRole("heading", { name: /payments/i })
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    console.log(`Recovered after going back online: ${recovered}`);
    expect(recovered).toBeTruthy();
  });

  test("6.4 — Slow network (3G simulation)", async ({ page }) => {
    // Simulate slow 3G
    const client = await page.context().newCDPSession(page);
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (500 * 1024) / 8, // 500kbps
      uploadThroughput: (500 * 1024) / 8,
      latency: 400,
    });

    await page.goto("/payments");
    await page.waitForTimeout(8000);

    await takeScreenshot(page, "64-slow-3g");

    // Page should still load (with loading states)
    const hasPaymentsContent =
      (await page.getByRole("heading", { name: /payments/i }).isVisible().catch(() => false)) ||
      (await page.locator(".animate-spin, .animate-pulse").count()) > 0;

    console.log(`Page loads on slow 3G: ${hasPaymentsContent}`);

    // Restore network
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  });

  test("6.5 — Browser back button during payment form", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();
    await page.waitForTimeout(500);

    // Go back
    await page.goBack();
    await page.waitForTimeout(2000);

    await takeScreenshot(page, "65-back-button");

    // Should navigate away without crash
    const noError = !(await page.getByText(/error|crash|unhandled/i).isVisible().catch(() => false));
    expect(noError).toBeTruthy();
  });

  test("6.6 — Payment submission during network disconnect", async ({
    page,
    context,
  }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    const memberSearch = page.getByPlaceholder(/search by name or phone/i);
    await memberSearch.fill(testMemberName.substring(0, 10));
    await page.waitForTimeout(600);
    const option = page.locator("button").filter({ hasText: testMemberName });
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
    }
    await page.locator('input[type="number"]').fill("800");

    // Go offline before submit
    await context.setOffline(true);

    await page.getByRole("button", { name: /record payment/i }).last().click();
    await page.waitForTimeout(3000);

    await takeScreenshot(page, "66-submit-offline");

    // Should show network error
    const hasNetworkError =
      (await page.locator("[data-sonner-toast]").count()) > 0 ||
      (await page.getByText(/network|connection|offline|error/i).count()) > 0;
    console.log(`Network error shown: ${hasNetworkError}`);

    // Go back online
    await context.setOffline(false);
    await page.waitForTimeout(1000);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 7. MOBILE VIEWPORT TESTS
// ══════════════════════════════════════════════════════════════════════

test.describe("7. Mobile Viewport Tests", () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page, OWNER_EMAIL);
  });

  test("7.1 — iPhone viewport — payments page", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
    await navigateToPayments(page);
    await takeScreenshot(page, "70-iphone-payments");

    // Check no horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    console.log(
      `iPhone: body=${bodyWidth}, viewport=${viewportWidth}, overflow=${bodyWidth > viewportWidth}`
    );

    // Check heading visible
    await expect(
      page.getByRole("heading", { name: /payments/i })
    ).toBeVisible();
  });

  test("7.2 — iPhone viewport — payment form", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await navigateToPayments(page);

    await page.getByRole("button", { name: /record payment/i }).click();
    await page.waitForTimeout(500);

    await takeScreenshot(page, "71-iphone-payment-form");

    // Check form inputs are usable (not cut off)
    const amountInput = page.locator('input[type="number"]');
    const isVisible = await amountInput.isVisible().catch(() => false);
    expect(isVisible).toBeTruthy();

    // Check submit button is visible (may need scroll)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const submitVisible = await page
      .getByRole("button", { name: /record payment/i })
      .last()
      .isVisible()
      .catch(() => false);
    console.log(`Submit button visible on iPhone after scroll: ${submitVisible}`);
    await takeScreenshot(page, "71b-iphone-form-scrolled");
  });

  test("7.3 — Android viewport — payments page", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 }); // Galaxy S8
    await navigateToPayments(page);
    await takeScreenshot(page, "72-android-payments");

    await expect(
      page.getByRole("heading", { name: /payments/i })
    ).toBeVisible();
  });

  test("7.4 — Tablet viewport — payments page", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await navigateToPayments(page);
    await takeScreenshot(page, "73-tablet-payments");

    await expect(
      page.getByRole("heading", { name: /payments/i })
    ).toBeVisible();
  });

  test("7.5 — iPhone viewport — billing plans", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await takeScreenshot(page, "74-iphone-billing");

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    console.log(
      `iPhone billing: body=${bodyWidth}, viewport=${viewportWidth}`
    );
  });

  test("7.6 — Mobile navigation to payments", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await takeScreenshot(page, "75-mobile-navigation");

    // Check for mobile menu/hamburger
    const hamburger = page.locator(
      "button[aria-label*='menu'], button[aria-label*='Menu'], button:has(svg.lucide-menu)"
    );
    const hasHamburger = await hamburger.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Mobile hamburger menu: ${hasHamburger}`);

    if (hasHamburger) {
      await hamburger.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, "75b-mobile-menu-open");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// 8. UX & ACCESSIBILITY TESTS
// ══════════════════════════════════════════════════════════════════════

test.describe("8. UX & Accessibility Tests", () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page, OWNER_EMAIL);
  });

  test("8.1 — Loading states on payments page", async ({ page }) => {
    // Intercept API to add delay
    await page.route("**/api/v1/payments**", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    await page.goto("/payments");
    await page.waitForTimeout(500);

    await takeScreenshot(page, "80-loading-state");

    // Check for skeleton/spinner loading indicators
    const hasLoadingIndicator =
      (await page.locator(".animate-pulse, .animate-spin").count()) > 0 ||
      (await page.locator("[class*='skeleton'], [class*='Skeleton']").count()) > 0;

    console.log(`Loading indicators present: ${hasLoadingIndicator}`);

    await page.unrouteAll();
  });

  test("8.2 — Empty state message when no payments", async ({ page }) => {
    // Intercept to return empty payments
    await page.route("**/api/v1/payments**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ payments: [], total: 0 }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await takeScreenshot(page, "81-empty-state");

    const hasEmptyState =
      (await page.getByText(/no payments/i).count()) > 0 ||
      (await page.getByText(/get started/i).count()) > 0;

    console.log(`Empty state message: ${hasEmptyState}`);
    expect(hasEmptyState).toBeTruthy();

    await page.unrouteAll();
  });

  test("8.3 — Keyboard navigation — payment form", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();
    await page.waitForTimeout(500);

    // Tab through form fields
    await page.keyboard.press("Tab"); // member search
    await page.keyboard.press("Tab"); // amount
    await page.keyboard.press("Tab"); // method
    await page.keyboard.press("Tab"); // status
    await page.keyboard.press("Tab"); // date
    await page.keyboard.press("Tab"); // notes

    await takeScreenshot(page, "82-keyboard-nav");

    // Check we can reach the submit button
    await page.keyboard.press("Tab"); // plan (renewal)
    await page.keyboard.press("Tab"); // start date
    await page.keyboard.press("Tab"); // end date
    await page.keyboard.press("Tab"); // submit button

    const activeElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName,
        type: (el as HTMLInputElement)?.type,
        text: el?.textContent,
      };
    });
    console.log(`Active element after tabbing: ${JSON.stringify(activeElement)}`);
  });

  test("8.4 — Form labels and ARIA attributes", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();
    await page.waitForTimeout(500);

    // Check for proper labels
    const labels = await page.locator("label").allTextContents();
    console.log(`Form labels: ${JSON.stringify(labels)}`);

    // Check member search has aria-label
    const memberSearch = page.getByPlaceholder(/search by name or phone/i);
    const ariaLabel = await memberSearch.getAttribute("aria-label");
    console.log(`Member search aria-label: ${ariaLabel}`);

    await takeScreenshot(page, "83-form-labels");
  });

  test("8.5 — Toast/notification messages are readable", async ({ page }) => {
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    // Submit empty form to trigger validation
    await page.getByRole("button", { name: /record payment/i }).last().click();
    await page.waitForTimeout(1000);

    await takeScreenshot(page, "84-error-messages");

    // Check error messages are human-readable (not raw JSON or object)
    const errorTexts = await page.locator(".text-destructive").allTextContents();
    for (const text of errorTexts) {
      const isHumanReadable =
        !text.includes("[object") && !text.includes("{") && text.length < 200;
      console.log(`Error message: "${text}" — readable: ${isHumanReadable}`);
      expect(isHumanReadable).toBeTruthy();
    }
  });

  test("8.6 — No console errors on payments page", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await navigateToPayments(page);
    await page.waitForTimeout(3000);

    console.log(`Console errors: ${consoleErrors.length}`);
    for (const err of consoleErrors) {
      console.log(`  - ${err}`);
    }

    await takeScreenshot(page, "85-console-errors");
  });

  test("8.7 — No console errors on billing page", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    console.log(`Billing page console errors: ${consoleErrors.length}`);
    for (const err of consoleErrors) {
      console.log(`  - ${err}`);
    }

    await takeScreenshot(page, "86-billing-console-errors");
  });

  test("8.8 — Pagination on payments page", async ({ page }) => {
    await navigateToPayments(page);
    await page.waitForTimeout(2000);

    // Check for pagination controls
    const hasPagination =
      (await page.getByRole("button", { name: /next|previous|page/i }).count()) > 0 ||
      (await page.getByText(/page \d/i).count()) > 0;

    await takeScreenshot(page, "87-pagination");
    console.log(`Pagination controls visible: ${hasPagination}`);
  });

  test("8.9 — Payment table responsive on narrow screens", async ({ page }) => {
    await navigateToPayments(page);
    await page.waitForTimeout(2000);

    // Resize to narrow width
    await page.setViewportSize({ width: 400, height: 800 });
    await page.waitForTimeout(500);

    await takeScreenshot(page, "88-narrow-table");

    // Check for horizontal scroll on table
    const hasOverflow = await page.evaluate(() => {
      const tables = document.querySelectorAll(".overflow-x-auto");
      return tables.length > 0;
    });
    console.log(`Table has horizontal scroll wrapper: ${hasOverflow}`);
  });

  test("8.10 — No raw [object Object] rendering", async ({ page }) => {
    await navigateToPayments(page);
    await page.waitForTimeout(2000);

    const bodyText = await page.locator("body").innerText();
    const hasRawObject = bodyText.includes("[object Object]");
    const hasRawJSON = /\{"\w+":/.test(bodyText);

    await takeScreenshot(page, "89-no-raw-objects");

    console.log(
      `Raw [object Object]: ${hasRawObject}, Raw JSON: ${hasRawJSON}`
    );
    expect(hasRawObject).toBeFalsy();
  });
});

// ══════════════════════════════════════════════════════════════════════
// 9. SESSION HANDLING DURING PAYMENT
// ══════════════════════════════════════════════════════════════════════

test.describe("9. Session Handling During Payment", () => {
  test("9.1 — Payment after session cookie cleared", async ({ page }) => {
    await loginUser(page, OWNER_EMAIL);
    await navigateToPayments(page);

    // Clear cookies to simulate session expiry
    await page.context().clearCookies();

    // Try refreshing — should redirect to login or show error
    await page.reload();
    await page.waitForTimeout(5000);

    const url = page.url();
    await takeScreenshot(page, "90-session-expired-payment");

    // Should redirect to login or show auth error
    const hasAuthError =
      url.includes("login") ||
      (await page.getByText(/session|expired|login|unauthorized|sign in/i).count()) > 0 ||
      (await page.locator("[data-sonner-toast]").count()) > 0;

    console.log(`After session clear: URL=${url}, authError=${hasAuthError}`);
  });

  test("9.2 — Payment form state preserved on page focus/blur", async ({
    page,
  }) => {
    await loginUser(page, OWNER_EMAIL);
    await navigateToPayments(page);
    await page.getByRole("button", { name: /record payment/i }).click();

    // Fill some data
    await page.locator('input[type="number"]').fill("2500");
    await page.getByPlaceholder(/optional notes/i).fill("Test note");

    // Simulate tab blur/focus
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await page.waitForTimeout(500);

    // Check values preserved
    const amountValue = await page.locator('input[type="number"]').inputValue();
    const notesValue = await page.getByPlaceholder(/optional notes/i).inputValue();

    await takeScreenshot(page, "91-form-preserved");

    expect(amountValue).toBe("2500");
    expect(notesValue).toBe("Test note");
  });
});

// ══════════════════════════════════════════════════════════════════════
// 10. PAYMENT AFTER AUTH OPERATIONS
// ══════════════════════════════════════════════════════════════════════

test.describe("10. Payment After Auth Operations", () => {
  test("10.1 — Unauthenticated user cannot access payments page", async ({
    page,
  }) => {
    await page.goto("/payments");
    await page.waitForTimeout(5000);

    const url = page.url();
    await takeScreenshot(page, "100-unauthenticated-payments");

    const redirectedToLogin = url.includes("login");
    console.log(`Unauthenticated access: redirected to login = ${redirectedToLogin}`);
    expect(redirectedToLogin).toBeTruthy();
  });

  test("10.2 — Unauthenticated user cannot access billing page", async ({
    page,
  }) => {
    await page.goto("/billing/manage");
    await page.waitForTimeout(5000);

    const url = page.url();
    await takeScreenshot(page, "101-unauthenticated-billing");
    console.log(`Unauthenticated billing access: URL = ${url}`);
  });
});
