import asyncio
from playwright.async_api import async_playwright
import json
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

FRONTEND_URL = "http://localhost:3001"
TEST_PASS = "TestPass123"

ROLES = {
    "owner": "owner2@test.com",
    "admin": "admin@test.com",
    "staff": "staff@test.com"
}

class RBACFrontendTester:
    def __init__(self):
        self.results = []

    async def test_role_visibility(self, browser, role, email):
        logging.info(f"Testing visibility for {role}...")
        context = await browser.new_context()
        page = await context.new_page()
        
        page.on("console", lambda msg: logging.info(f"BROWSER CONSOLE [{msg.type}]: {msg.text}"))
        page.on("request", lambda req: logging.info(f"BROWSER REQUEST: {req.method} {req.url}"))
        page.on("response", lambda res: logging.info(f"BROWSER RESPONSE: {res.status} {res.url}"))
        
        # Login
        await page.goto(f"{FRONTEND_URL}/login")
        await page.fill("input[id='email']", email)
        await page.fill("input[id='password']", TEST_PASS)
        await page.click("button[type='submit']")
        
        logging.info(f"Login submitted for {role}. Waiting for navigation...")
        try:
            await page.wait_for_url(lambda url: "/dashboard" in url, timeout=10000)
            logging.info(f"Successfully reached {page.url} for {role}")
        except Exception as e:
            logging.error(f"Failed to reach dashboard for {role}. Current URL: {page.url}")
            # Check if there's an error message
            body_text = await page.evaluate("document.body.innerText")
            logging.error(f"Page body text: {body_text[:200]}...")
            await context.close()
            return
        
        # Check sidebar items
        sidebar_text = await page.inner_text("nav")
        
        has_billing = "Billing" in sidebar_text
        has_setup = "Setup Wizard" in sidebar_text
        has_settings = "Settings" in sidebar_text
        
        role_results = {
            "role": role,
            "has_billing": has_billing,
            "has_setup": has_setup,
            "has_settings": has_settings
        }
        
        # Expected vs Actual
        expectations = {
            "owner": {"has_billing": True, "has_setup": True, "has_settings": True},
            "admin": {"has_billing": False, "has_setup": True, "has_settings": True},
            "staff": {"has_billing": False, "has_setup": False, "has_settings": False}
        }
        
        expected = expectations[role]
        passed = all(role_results[k] == expected[k] for k in expected)
        
        self.results.append({
            "role": role,
            "actual": role_results,
            "expected": expected,
            "passed": passed
        })
        
        if passed:
            logging.info(f"PASS: Sidebar visibility for {role}")
        else:
            logging.error(f"FAIL: Sidebar visibility for {role} - Got {role_results}, expected {expected}")

        # Attempt direct access
        if role != "owner":
            logging.info(f"Attempting direct access to /billing/manage for {role}...")
            await page.goto(f"{FRONTEND_URL}/billing/manage")
            await asyncio.sleep(1) # wait for redirect
            if "/dashboard" in page.url or "403" in await page.content() or "Access Denied" in await page.content():
                logging.info(f"PASS: Direct access restricted for {role} to /billing/manage")
            else:
                logging.error(f"FAIL: Direct access ALLOWED for {role} to /billing/manage (Current URL: {page.url})")

        await context.close()

    async def run(self):
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            for role, email in ROLES.items():
                await self.test_role_visibility(browser, role, email)
            await browser.close()

        print("\n" + "="*50)
        print("FRONTEND RBAC TEST RESULTS")
        print("="*50)
        print(json.dumps(self.results, indent=2))

if __name__ == "__main__":
    tester = RBACFrontendTester()
    asyncio.run(tester.run())
