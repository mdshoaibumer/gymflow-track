/**
 * ═══════════════════════════════════════════════════════════════════
 * GYMFLOW — MODULE 08: SECURITY E2E TESTS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests: XSS, SQL Injection, Unauthorized API access, Token leaks,
 *        Sensitive data exposure, Role escalation, Hidden routes,
 *        Client-side validation bypass, CORS.
 */
import { test, expect } from "@playwright/test";
import {
  API_BASE,
  TEST_PASSWORD,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
  registerViaAPI,
  loginViaUI,
  uniqueEmail,
  uniquePhone,
  setupErrorCollector,
} from "./fixtures";

let ownerEmail: string;

test.beforeAll(async ({ request }) => {
  const { resp, email } = await registerViaAPI(request);
  expect([200, 201]).toContain(resp.status());
  ownerEmail = email;
});

// ══════════════════════════════════════════════════════════════════════
//  API SECURITY — Unauthorized Access
// ══════════════════════════════════════════════════════════════════════
test.describe("08. SECURITY — API Auth", () => {
  test("GET /members requires authentication", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/members`);
    expect([401, 403]).toContain(resp.status());
  });

  test("GET /payments requires authentication", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/payments`);
    expect([401, 403]).toContain(resp.status());
  });

  test("GET /users requires authentication", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/users`);
    expect([401, 403]).toContain(resp.status());
  });

  test("POST /members requires authentication", async ({ request }) => {
    const resp = await request.post(`${API_BASE}/members`, {
      data: { name: "Hacker", phone: "9876543210" },
    });
    expect([401, 403]).toContain(resp.status());
  });

  test("GET /dashboard/metrics requires authentication", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/dashboard/metrics`);
    expect([401, 403]).toContain(resp.status());
  });

  test("Admin endpoints require super_admin role", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/admin/gyms`);
    expect([401, 403]).toContain(resp.status());
  });
});

// ══════════════════════════════════════════════════════════════════════
//  SQL INJECTION ATTEMPTS
// ══════════════════════════════════════════════════════════════════════
test.describe("08. SECURITY — SQL Injection", () => {
  test("SQLi in login email field", async ({ request }) => {
    const payloads = [
      "' OR 1=1 --",
      "admin'--",
      "' UNION SELECT * FROM users --",
      "1; DROP TABLE users --",
    ];

    for (const payload of payloads) {
      const resp = await request.post(`${API_BASE}/auth/login`, {
        data: { email: payload, password: "test" },
      });
      // Should return 401 or 422 — NEVER 200
      expect(resp.status()).not.toBe(200);
      // Should not return 500 (which might indicate SQL error)
      expect(resp.status()).not.toBe(500);
    }
  });

  test("SQLi in member search parameter", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const searchInput = page.locator("input[placeholder*='search' i], input[type='search']").first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill("'; DROP TABLE members; --");
      await page.waitForTimeout(2000);
      // Should not crash
      expect(page.url()).toContain("/members");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
//  XSS ATTEMPTS
// ══════════════════════════════════════════════════════════════════════
test.describe("08. SECURITY — XSS", () => {
  test("XSS in member name via API", async ({ request }) => {
    // First, login
    const loginResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: ownerEmail, password: TEST_PASSWORD },
    });
    expect(loginResp.status()).toBe(200);

    // Try creating member with XSS payload
    const resp = await request.post(`${API_BASE}/members`, {
      data: {
        name: '<script>alert("xss")</script>',
        phone: uniquePhone(),
      },
    });

    // If it succeeds, the name should be stored without executing
    if (resp.status() === 201 || resp.status() === 200) {
      const data = await resp.json();
      // Name should be stored as-is or sanitized — never executed
      expect(typeof data.name).toBe("string");
    }
  });

  test("XSS payloads in URL params don't execute", async ({ page }) => {
    let alertFired = false;
    page.on("dialog", () => {
      alertFired = true;
    });

    await page.goto('/members?search=<script>alert("xss")</script>');
    await page.waitForTimeout(2000);
    expect(alertFired).toBeFalsy();
  });
});

// ══════════════════════════════════════════════════════════════════════
//  TOKEN & SESSION SECURITY
// ══════════════════════════════════════════════════════════════════════
test.describe("08. SECURITY — Token Security", () => {
  test("no JWT tokens in localStorage after login", async ({ page }) => {
    await loginViaUI(page, ownerEmail);

    const localStorage = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)!;
        items[key] = window.localStorage.getItem(key)!;
      }
      return items;
    });

    // No JWT-like values in localStorage (HttpOnly cookies should be used)
    const values = Object.values(localStorage);
    const hasJWT = values.some((v) => v && v.includes("eyJ")); // JWT header
    expect(hasJWT).toBeFalsy();
  });

  test("no tokens in sessionStorage", async ({ page }) => {
    await loginViaUI(page, ownerEmail);

    const sessionStorage = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i)!;
        items[key] = window.sessionStorage.getItem(key)!;
      }
      return items;
    });

    const values = Object.values(sessionStorage);
    const hasJWT = values.some((v) => v && v.includes("eyJ"));
    expect(hasJWT).toBeFalsy();
  });

  test("auth cookies are HttpOnly (not accessible via JS)", async ({ page }) => {
    await loginViaUI(page, ownerEmail);

    const jsCookies = await page.evaluate(() => document.cookie);
    // HttpOnly cookies should NOT appear in document.cookie
    expect(jsCookies).not.toContain("access_token");
    expect(jsCookies).not.toContain("refresh_token");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  ROLE ESCALATION
// ══════════════════════════════════════════════════════════════════════
test.describe("08. SECURITY — Role Escalation", () => {
  test("owner cannot access super admin API endpoints", async ({ request }) => {
    // Login as owner
    await request.post(`${API_BASE}/auth/login`, {
      data: { email: ownerEmail, password: TEST_PASSWORD },
    });

    // Try accessing admin endpoint
    const resp = await request.get(`${API_BASE}/admin/gyms`);
    expect([401, 403]).toContain(resp.status());
  });

  test("owner cannot access /admin UI", async ({ page }) => {
    await loginViaUI(page, ownerEmail);
    await page.goto("/admin");
    await page.waitForTimeout(3000);
    // Should be redirected away
    expect(page.url()).not.toMatch(/^.*\/admin$/);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  INVALID API PAYLOADS
// ══════════════════════════════════════════════════════════════════════
test.describe("08. SECURITY — Payload Validation", () => {
  test("malformed JSON is handled gracefully", async ({ request }) => {
    const resp = await request.post(`${API_BASE}/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: "not valid json{{{",
    });
    // Should return 400 or 422 — not 500
    expect([400, 422]).toContain(resp.status());
  });

  test("extra fields in API request are ignored or rejected", async ({ request }) => {
    const resp = await request.post(`${API_BASE}/auth/login`, {
      data: {
        email: ownerEmail,
        password: TEST_PASSWORD,
        role: "super_admin", // Shouldn't be allowed
        is_admin: true,
      },
    });
    // Should still work as normal login (extra fields ignored)
    expect(resp.status()).toBe(200);
  });

  test("oversized payload is rejected", async ({ request }) => {
    const largeString = "A".repeat(1_000_000); // 1MB payload
    const resp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: largeString, password: largeString },
    });
    // Should return error — not crash
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });
});
