/**
 * Enhanced Playwright config for comprehensive QA testing.
 * Run with: npx playwright test --config=e2e/playwright.config.qa.ts
 */
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./qa-tests",
  fullyParallel: false, // Serial by default for data-dependent tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Serial execution — shared DB state
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report-qa" }],
    ["list"],
    ["json", { outputFile: "qa-test-results.json" }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "on",
    video: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Capture console logs
    bypassCSP: true,
  },

  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
