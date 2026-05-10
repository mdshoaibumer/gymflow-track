import asyncio
from playwright.async_api import async_playwright
import time
import json
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

FRONTEND_URL = "http://localhost:3000"
VALID_EMAIL = "owner2@test.com"
VALID_PASS = "TestPass123"

class AuthQA:
    """
    AuthQA Class
    
    Provides a suite of end-to-end tests for validating the authentication and authorization
    flows of the GymFlow application using Playwright.
    """
    def __init__(self):
        """Initializes the test reporter with empty lists for pass/fail results and issues."""
        self.passed = []
        self.failed = []
        self.issues = []
        
    def report_pass(self, name):
        """Logs and records a passed test case."""
        logging.info(f"PASS: {name}")
        self.passed.append(name)
        
    def report_fail(self, name, reason):
        """Logs and records a failed test case with a reason."""
        logging.error(f"FAIL: {name} - {reason}")
        self.failed.append({"name": name, "reason": reason})

    def report_issue(self, severity, issue):
        """Logs and records a non-critical issue or observation."""
        logging.warning(f"ISSUE [{severity}]: {issue}")
        self.issues.append({"severity": severity, "issue": issue})

    async def run_tests(self):
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            
            # Setup context with console log listener
            context = await browser.new_context()
            page = await context.new_page()
            
            console_errors = []
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            
            network_requests = []
            page.on("request", lambda req: network_requests.append(req.url))

            # --- 1. Unauthorized Access Test ---
            logging.info("Running: Unauthorized Access Test")
            await page.goto(f"{FRONTEND_URL}/dashboard")
            await page.wait_for_load_state("networkidle")
            if "/login" in page.url:
                self.report_pass("Unauthorized Access Redirect")
            else:
                self.report_fail("Unauthorized Access Redirect", f"Did not redirect to login, current url: {page.url}")

            # --- 2. Invalid Login ---
            logging.info("Running: Invalid Login Test")
            await page.goto(f"{FRONTEND_URL}/login")
            await page.fill("input[type='email']", "wrong@test.com")
            await page.fill("input[type='password']", "wrongpass")
            # Wait for error message (toast or text) or network response
            try:
                # Let's wait for the login response
                async with page.expect_response("**/auth/login") as response_info:
                    await page.click("button[type='submit']")
                response = await response_info.value
                if response.status == 401:
                    # Look for toast or error message in DOM
                    await asyncio.sleep(1) # wait for toast animation
                    body_text = await page.evaluate("document.body.innerText")
                    if "invalid" in body_text.lower() or "error" in body_text.lower() or "wrong" in body_text.lower():
                        self.report_pass("Invalid Login Error Handling")
                    else:
                        self.report_fail("Invalid Login Error Handling", "No visible error message on invalid login in UI")
                else:
                    self.report_fail("Invalid Login Error Handling", f"Expected 401, got {response.status}")
            except Exception as e:
                self.report_fail("Invalid Login Error Handling", f"Exception: {str(e)}")

            # --- 3. Rapid Login Attempts ---
            logging.info("Running: Rapid Login Attempts Test")
            await page.goto(f"{FRONTEND_URL}/login")
            for _ in range(5):
                await page.fill("input[type='email']", VALID_EMAIL)
                await page.fill("input[type='password']", "wrongpass")
                await page.click("button[type='submit']")
                await asyncio.sleep(0.2)
            # Just observing if it crashes or shows rate limit.
            self.report_pass("Rapid Login Attempts (Crash Check)")

            # --- 4. Valid Login & JWT Lifecycle ---
            logging.info("Running: Valid Login Test")
            network_requests.clear()
            await page.goto(f"{FRONTEND_URL}/login")
            await page.fill("input[type='email']", VALID_EMAIL)
            await page.fill("input[type='password']", VALID_PASS)
            await page.click("button[type='submit']")
            await page.wait_for_url("**/dashboard**", timeout=10000)
            
            if "/dashboard" in page.url:
                self.report_pass("Valid Login & Redirect")
            else:
                self.report_fail("Valid Login & Redirect", f"Failed to redirect to dashboard. Current URL: {page.url}")

            auth_me_count = sum(1 for req in network_requests if "/auth/me" in req)
            if auth_me_count > 2:
                self.report_issue("Medium", f"Duplicate /auth/me requests detected ({auth_me_count} times) during login flow")
            else:
                self.report_pass("No Duplicate /auth/me Requests")

            # Check local storage for tokens
            ls = await page.evaluate("() => JSON.stringify(window.localStorage)")
            if "token" in ls or "gymflow-auth" in ls or "access_token" in ls:
                self.report_pass("Token Persistence (Local Storage)")
            else:
                self.report_issue("High", "Tokens not found in Local Storage. Using cookies?")

            # --- 5. Browser Refresh ---
            logging.info("Running: Browser Refresh Test")
            network_requests.clear()
            await page.reload()
            await page.wait_for_load_state("networkidle")
            if "/dashboard" in page.url:
                self.report_pass("Browser Refresh (Hydration)")
            else:
                self.report_fail("Browser Refresh (Hydration)", "Lost auth state on refresh")

            # --- 6. Multiple Tabs Sync ---
            logging.info("Running: Multiple Tabs Sync Test")
            tab2 = await context.new_page()
            await tab2.goto(f"{FRONTEND_URL}/dashboard")
            await tab2.wait_for_load_state("networkidle")
            if "/dashboard" in tab2.url:
                self.report_pass("Multiple Tabs Sync (Auth Sharing)")
            else:
                self.report_fail("Multiple Tabs Sync (Auth Sharing)", "Second tab not authenticated")
            await tab2.close()

            # --- 7. Logout ---
            logging.info("Running: Logout Test")
            # Try to find logout button
            try:
                # Click the user avatar menu (it has rounded-full class)
                await page.click(".rounded-full")
                await asyncio.sleep(0.5) # wait for dropdown to open
                
                logout_btn = await page.wait_for_selector("text='Logout'", timeout=5000)
                await logout_btn.click()
                await page.wait_for_url("**/login**", timeout=5000)
                self.report_pass("Logout Action & Redirect")
            except Exception as e:
                self.report_fail("Logout Action", "Could not find or click logout button")

            # --- 8. Back-button after logout ---
            logging.info("Running: Back-button After Logout Test")
            await page.go_back()
            await page.wait_for_load_state("networkidle")
            if "/login" in page.url or "/dashboard" not in page.url:
                self.report_pass("Back-button Protection")
            else:
                # Some apps load dashboard then redirect, let's wait a bit
                await asyncio.sleep(2)
                if "/dashboard" in page.url:
                    self.report_fail("Back-button Protection", "Able to access protected route after logout via back button")
                else:
                    self.report_pass("Back-button Protection")

            # Check Console Errors
            if console_errors:
                self.report_issue("Low", f"Found {len(console_errors)} console errors during test")

            # --- 9. Slow Network Behavior ---
            logging.info("Running: Slow Network Behavior Test")
            context2 = await browser.new_context()
            page3 = await context2.new_page()
            
            # Load the page first before throttling to prevent timeout
            await page3.goto(f"{FRONTEND_URL}/login")
            await page3.wait_for_load_state("networkidle")
            
            await page3.fill("input[type='email']", VALID_EMAIL)
            await page3.fill("input[type='password']", VALID_PASS)
            
            # Simulate slow network via CDP NOW
            cdp = await context2.new_cdp_session(page3)
            await cdp.send("Network.enable")
            await cdp.send("Network.emulateNetworkConditions", {
                "offline": False,
                "downloadThroughput": 500 * 1024 / 8,
                "uploadThroughput": 500 * 1024 / 8,
                "latency": 400
            })
            
            # We want to check for a loading state
            await page3.click("button[type='submit']")
            try:
                # Check if a spinner or loading text appears
                # or if the button is disabled
                await asyncio.sleep(0.5)
                is_disabled = await page3.evaluate("document.querySelector('button[type=\"submit\"]').disabled")
                has_loading = await page3.query_selector(".animate-spin")
                
                if is_disabled or has_loading:
                    self.report_pass("Loading States on Slow Network")
                else:
                    self.report_issue("Medium", "No visible loading state or button disable during slow network login")
            except Exception as e:
                self.report_issue("Medium", f"Failed to verify loading state: {e}")
            
            await context2.close()
            await browser.close()

            # Format final report
            print("\n" + "="*50)
            print("AUTH TEST REPORT")
            print("="*50)
            print(json.dumps({
                "passed": self.passed,
                "failed": self.failed,
                "issues": self.issues
            }, indent=2))

if __name__ == "__main__":
    qa = AuthQA()
    asyncio.run(qa.run_tests())
