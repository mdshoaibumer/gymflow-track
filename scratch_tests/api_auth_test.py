import httpx
import json
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

API_BASE_URL = "http://localhost:8000/api/v1"
TEST_PASS = "TestPass123"

USERS = {
    "owner": "owner2@test.com",
    "admin": "admin@test.com",
    "staff": "staff@test.com"
}

class APIAuthTester:
    def __init__(self):
        self.tokens = {}
        self.results = []

    def login(self, role, email):
        logging.info(f"Logging in as {role} ({email})...")
        try:
            response = httpx.post(f"{API_BASE_URL}/auth/login", json={
                "email": email,
                "password": TEST_PASS
            })
            if response.status_code == 200:
                self.tokens[role] = response.json()["access_token"]
                logging.info(f"Login successful for {role}")
            else:
                logging.error(f"Login failed for {role}: {response.status_code} {response.text}")
        except Exception as e:
            logging.error(f"Error logging in as {role}: {e}")

    def test_endpoint(self, name, method, endpoint, role, expected_status):
        token = self.tokens.get(role)
        if not token:
            logging.error(f"No token for {role}, skipping {name}")
            return

        headers = {"Authorization": f"Bearer {token}"}
        logging.info(f"Testing {name} for {role} (Expected: {expected_status})...")
        
        try:
            if method == "GET":
                response = httpx.get(f"{API_BASE_URL}{endpoint}", headers=headers)
            elif method == "POST":
                response = httpx.post(f"{API_BASE_URL}{endpoint}", headers=headers, json={})
            
            actual_status = response.status_code
            passed = actual_status == expected_status
            
            self.results.append({
                "name": name,
                "role": role,
                "endpoint": endpoint,
                "expected": expected_status,
                "actual": actual_status,
                "passed": passed
            })
            
            if passed:
                logging.info(f"PASS: {name} ({role})")
            else:
                logging.error(f"FAIL: {name} ({role}) - Expected {expected_status}, got {actual_status}")
                if actual_status == 200 and expected_status == 403:
                    logging.critical(f"SECURITY ISSUE: Privilege Escalation detected on {endpoint} for {role}!")

        except Exception as e:
            logging.error(f"Error testing {name}: {e}")

    def run(self):
        for role, email in USERS.items():
            self.login(role, email)

        if not self.tokens:
            logging.error("No tokens obtained, aborting tests.")
            return

        # --- Billing (Owner only) ---
        self.test_endpoint("Get Subscription", "GET", "/billing/subscription", "owner", 200)
        self.test_endpoint("Get Subscription", "GET", "/billing/subscription", "admin", 403)
        self.test_endpoint("Get Subscription", "GET", "/billing/subscription", "staff", 403)
        
        self.test_endpoint("Get Billing Metrics", "GET", "/billing/metrics", "owner", 200)
        self.test_endpoint("Get Billing Metrics", "GET", "/billing/metrics", "admin", 403)
        self.test_endpoint("Get Billing Metrics", "GET", "/billing/metrics", "staff", 403)

        # --- Attendance ---
        self.test_endpoint("Get Today Attendance", "GET", "/attendance/today", "staff", 200)
        self.test_endpoint("Get Member QR", "GET", "/attendance/member/4f60f721-4832-4f88-9973-1217f1baf26a/qr", "staff", 403)
        self.test_endpoint("Get Member QR", "GET", "/attendance/member/4f60f721-4832-4f88-9973-1217f1baf26a/qr", "admin", 200)

        # --- Users/Staff Management ---
        self.test_endpoint("List Users", "GET", "/users/", "owner", 200)
        self.test_endpoint("List Users", "GET", "/users/", "admin", 200)
        self.test_endpoint("List Users", "GET", "/users/", "staff", 403)

        print("\n" + "="*50)
        print("API AUTHORIZATION TEST RESULTS")
        print("="*50)
        print(json.dumps(self.results, indent=2))

if __name__ == "__main__":
    tester = APIAuthTester()
    tester.run()
