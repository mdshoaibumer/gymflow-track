import asyncio
from playwright.async_api import async_playwright
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

FRONTEND_URL = "http://localhost:3000"
TEST_PASS = "TestPass123"

async def test_role_switch():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        # 1. Login as Owner
        logging.info("Logging in as Owner...")
        await page.goto(f"{FRONTEND_URL}/login")
        await page.fill("input[type='email']", "owner2@test.com")
        await page.fill("input[type='password']", TEST_PASS)
        await page.click("button[type='submit']")
        await page.wait_for_url("**/dashboard**")
        
        sidebar = await page.inner_text("nav")
        if "Billing" in sidebar:
            logging.info("Owner has Billing")
        else:
            logging.error("Owner missing Billing")

        # 2. Logout
        logging.info("Logging out...")
        await page.click('[aria-label="User menu"]')
        await asyncio.sleep(0.5)
        logout_btn = await page.wait_for_selector("text='Logout'", timeout=5000)
        await logout_btn.click()
        await page.wait_for_url("**/login**")
        
        # 3. Login as Staff in same session
        logging.info("Logging in as Staff...")
        await page.fill("input[type='email']", "staff@test.com")
        await page.fill("input[type='password']", TEST_PASS)
        await page.click("button[type='submit']")
        await page.wait_for_url("**/dashboard**")
        
        # Verify stale role cleanup
        sidebar_staff = await page.inner_text("nav")
        if "Billing" not in sidebar_staff:
            logging.info("PASS: Staff does not have stale Owner billing permissions")
        else:
            logging.error("FAIL: Staff HAS stale Owner billing permissions (Sidebar leakage)")
            
        # Try direct access to billing as staff
        await page.goto(f"{FRONTEND_URL}/billing/manage")
        await asyncio.sleep(1)
        if "/dashboard" in page.url or "403" in await page.content() or "Access Denied" in await page.content():
            logging.info("PASS: Staff direct access to billing restricted")
        else:
            logging.error(f"FAIL: Staff direct access to billing ALLOWED (URL: {page.url})")
            
        await context.close()
        await browser.close()

if __name__ == "__main__":
    asyncio.run(test_role_switch())
