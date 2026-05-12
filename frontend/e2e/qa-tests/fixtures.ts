/**
 * ═══════════════════════════════════════════════════════════════════
 * GYMFLOW — E2E TEST FIXTURES & HELPERS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Shared test infrastructure used by all QA test files.
 * Provides: authenticated pages, API helpers, data generators,
 *           console/network error collectors, screenshot utilities.
 */
import { test as base, expect, type Page, type APIRequestContext } from "@playwright/test";

// ── Constants ─────────────────────────────────────────────────────────
export const API_BASE = "http://localhost:8000/api/v1";
export const TEST_PASSWORD = "StrongPass1A";
export const SUPER_ADMIN_EMAIL = "admin@gymflow.dev";
export const SUPER_ADMIN_PASSWORD = "SuperAdmin@2026!";

const RUN_ID = Date.now();
let ownerCounter = 0;

// ── Data Generators ───────────────────────────────────────────────────
export function uniqueEmail(prefix = "qa"): string {
  return `${prefix}_${RUN_ID}_${++ownerCounter}@testgym.com`;
}

export function uniquePhone(): string {
  const digits = String(Math.floor(Math.random() * 900000000) + 100000000);
  return `9${digits}`;
}

export function uniqueGymName(): string {
  return `QA Gym ${RUN_ID}_${++ownerCounter}`;
}

export function uniqueMemberName(suffix = ""): string {
  return `QA Member ${RUN_ID} ${suffix}`.trim();
}

// ── API Helpers ───────────────────────────────────────────────────────
export async function registerViaAPI(
  request: APIRequestContext,
  overrides: Partial<{
    gym_name: string;
    owner_name: string;
    phone: string;
    email: string;
    password: string;
  }> = {}
) {
  const email = overrides.email ?? uniqueEmail("owner");
  const resp = await request.post(`${API_BASE}/auth/register`, {
    data: {
      gym_name: overrides.gym_name ?? uniqueGymName(),
      owner_name: overrides.owner_name ?? "QA Owner",
      phone: overrides.phone ?? uniquePhone(),
      email,
      password: overrides.password ?? TEST_PASSWORD,
    },
  });
  return { resp, email };
}

export async function loginViaAPI(
  request: APIRequestContext,
  email: string,
  password: string = TEST_PASSWORD
) {
  return request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
}

// ── UI Helpers ────────────────────────────────────────────────────────
export async function loginViaUI(
  page: Page,
  email: string,
  password: string = TEST_PASSWORD
) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(dashboard|setup|admin)/, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}

export async function logoutViaUI(page: Page) {
  // The logout is inside a user dropdown menu (Avatar trigger with aria-label="User menu")
  const userMenuBtn = page.getByRole("button", { name: /user menu/i });
  if (await userMenuBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await userMenuBtn.click();
    await page.waitForTimeout(800);
    // Radix DropdownMenu renders items with role="menuitem"
    const menuLogout = page.getByRole("menuitem", { name: /log\s?out/i });
    if (await menuLogout.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuLogout.click();
    } else {
      // Fallback: try clicking any element with "Logout" text inside the dropdown portal
      const logoutText = page.locator('[role="menu"] >> text=Logout').first();
      if (await logoutText.isVisible({ timeout: 2000 }).catch(() => false)) {
        await logoutText.click();
      }
    }
  } else {
    // Admin layout has a direct "Sign out" button in sidebar
    const signOutBtn = page.getByRole("button", { name: /sign\s?out|log\s?out/i });
    if (await signOutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signOutBtn.click();
    }
  }
  await page.waitForURL(/\/(login|$)/, { timeout: 15000 }).catch(() => {});
}

export async function navigateTo(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

// ── Console & Network Error Collectors ────────────────────────────────
export interface ErrorCollector {
  consoleErrors: string[];
  pageErrors: string[];
  networkFailures: string[];
  clear(): void;
  getCriticalErrors(): string[];
}

export function setupErrorCollector(page: Page): ErrorCollector {
  const collector: ErrorCollector = {
    consoleErrors: [],
    pageErrors: [],
    networkFailures: [],
    clear() {
      this.consoleErrors.length = 0;
      this.pageErrors.length = 0;
      this.networkFailures.length = 0;
    },
    getCriticalErrors() {
      const ignoredPatterns = [
        /favicon/i,
        /hydrat/i,
        /401/,
        /Failed to load resource/,
        /net::ERR/,
        /ResizeObserver/,
        /Loading chunk/,
        /recharts/i,
        /defaultProps/i,
        /Warning:/,
        /React does not recognize/,
        /Invalid DOM property/,
        /unique "key" prop/,
        /Each child in a list/,
        /Cannot update a component/,
        /findDOMNode is deprecated/,
        /Failed to fetch RSC payload/,
        /RSC/,
        /Falling back to browser navigation/,
        /fetchServerResponse/,
        /Failed to fetch$/,
      ];
      return [
        ...this.consoleErrors,
        ...this.pageErrors,
      ].filter((e) => !ignoredPatterns.some((p) => p.test(e)));
    },
  };

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      collector.consoleErrors.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    collector.pageErrors.push(`PAGE_ERROR: ${err.message}`);
  });

  page.on("response", (resp) => {
    if (resp.status() >= 500) {
      collector.networkFailures.push(
        `${resp.status()} ${resp.url()}`
      );
    }
  });

  return collector;
}

// ── Performance Helper ────────────────────────────────────────────────
export async function measurePageLoad(page: Page, url: string): Promise<number> {
  const start = Date.now();
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  return Date.now() - start;
}

// ── Toast Helpers ─────────────────────────────────────────────────────
export async function waitForToast(
  page: Page,
  textPattern: RegExp,
  timeout = 8000
): Promise<boolean> {
  try {
    await page
      .locator("[data-sonner-toast]")
      .filter({ hasText: textPattern })
      .first()
      .waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

export async function waitForErrorAlert(
  page: Page,
  timeout = 5000
): Promise<boolean> {
  try {
    await page
      .locator("[role='alert']")
      .first()
      .waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

// ── Form Helpers ──────────────────────────────────────────────────────
export async function fillMemberForm(
  page: Page,
  data: {
    name?: string;
    phone?: string;
    email?: string;
    gender?: string;
    plan?: string;
    amount?: string;
    startDate?: string;
    endDate?: string;
  }
) {
  if (data.name !== undefined) {
    const field = page.locator("#name, [name='name']").first();
    await field.clear();
    await field.fill(data.name);
  }
  if (data.phone !== undefined) {
    const field = page.locator("#phone, [name='phone']").first();
    await field.clear();
    await field.fill(data.phone);
  }
  if (data.email !== undefined) {
    const field = page.locator("#email, [name='email']").first();
    await field.clear();
    await field.fill(data.email);
  }
  if (data.gender !== undefined) {
    const field = page.locator("#gender, [name='gender']").first();
    await field.selectOption(data.gender);
  }
  if (data.plan !== undefined) {
    const field = page.locator("#membership_plan, [name='membership_plan']").first();
    await field.clear();
    await field.fill(data.plan);
  }
  if (data.amount !== undefined) {
    const field = page.locator("#amount_paid, [name='amount_paid']").first();
    await field.clear();
    await field.fill(data.amount);
  }
  if (data.startDate !== undefined) {
    const field = page.locator("#membership_start, [name='membership_start']").first();
    await field.fill(data.startDate);
  }
  if (data.endDate !== undefined) {
    const field = page.locator("#membership_end, [name='membership_end']").first();
    await field.fill(data.endDate);
  }
}

// ── Accessibility Helpers ─────────────────────────────────────────────
export async function checkBasicA11y(page: Page): Promise<string[]> {
  const issues: string[] = [];

  // Check for images without alt text
  const imgsWithoutAlt = await page.locator("img:not([alt])").count();
  if (imgsWithoutAlt > 0) {
    issues.push(`${imgsWithoutAlt} image(s) missing alt text`);
  }

  // Check for buttons without accessible names
  const buttons = page.locator("button");
  const btnCount = await buttons.count();
  for (let i = 0; i < btnCount; i++) {
    const btn = buttons.nth(i);
    const text = await btn.textContent();
    const ariaLabel = await btn.getAttribute("aria-label");
    const title = await btn.getAttribute("title");
    if (!text?.trim() && !ariaLabel && !title) {
      issues.push(`Button at index ${i} has no accessible name`);
    }
  }

  // Check for form inputs without labels
  const inputs = page.locator("input:not([type='hidden']):not([type='submit'])");
  const inputCount = await inputs.count();
  for (let i = 0; i < inputCount; i++) {
    const input = inputs.nth(i);
    const id = await input.getAttribute("id");
    const ariaLabel = await input.getAttribute("aria-label");
    const ariaLabelledBy = await input.getAttribute("aria-labelledby");
    const placeholder = await input.getAttribute("placeholder");
    if (!id && !ariaLabel && !ariaLabelledBy && !placeholder) {
      issues.push(`Input at index ${i} has no label or aria-label`);
    }
  }

  return issues;
}

// ── Screenshot Helper ─────────────────────────────────────────────────
export async function screenshotOnFail(
  page: Page,
  testName: string
): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/${testName.replace(/[^a-zA-Z0-9]/g, "_")}.png`,
    fullPage: true,
  });
}
