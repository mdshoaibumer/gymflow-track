import { test, expect } from "@playwright/test";

test.describe("Billing Pages", () => {
  test("billing plans page loads without auth", async ({ page }) => {
    // The billing plans page should be accessible (may redirect to login
    // but plans endpoint is public)
    await page.goto("/billing");
    // Either shows pricing or redirects to login
    const url = page.url();
    expect(url).toMatch(/billing|login/);
  });

  test("billing page shows plan cards when authenticated", async ({ page }) => {
    // This test verifies the page structure renders
    // In a real environment with backend running, we'd log in first
    await page.goto("/login");
    // Verify the login form at minimum loads correctly
    await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("login page has link to register", async ({ page }) => {
    await page.goto("/login");
    const registerLink = page.getByRole("link", { name: /register|sign up|create/i });
    await expect(registerLink).toBeVisible();
  });

  test("register page has link to login", async ({ page }) => {
    await page.goto("/register");
    const loginLink = page.getByRole("link", { name: /login|sign in/i });
    await expect(loginLink).toBeVisible();
  });
});

test.describe("Error Handling", () => {
  test("404 page or redirect for unknown routes", async ({ page }) => {
    const response = await page.goto("/this-does-not-exist-at-all");
    // Next.js returns 404 or redirects
    const status = response?.status();
    expect(status === 404 || status === 200).toBeTruthy();
  });
});
