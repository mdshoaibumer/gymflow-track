import httpx
import logging
import json

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

API_BASE_URL = "http://localhost:8000/api/v1"
TEST_PASS = "TestPass123"

def get_token(email):
    resp = httpx.post(f"{API_BASE_URL}/auth/login", json={"email": email, "password": TEST_PASS})
    if resp.status_code == 200:
        return resp.json()["access_token"]
    else:
        logging.error(f"Failed to login {email}")
        return None

def test_replay():
    owner_token = get_token("owner2@test.com")
    staff_token = get_token("staff@test.com")
    
    if not owner_token or not staff_token:
        return
        
    # Owner requests billing
    logging.info("Owner requesting billing metrics...")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    owner_resp = httpx.get(f"{API_BASE_URL}/billing/metrics", headers=owner_headers)
    logging.info(f"Owner response: {owner_resp.status_code}")
    
    # Replay with staff token
    logging.info("Staff replaying billing metrics request...")
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    staff_resp = httpx.get(f"{API_BASE_URL}/billing/metrics", headers=staff_headers)
    logging.info(f"Staff replay response: {staff_resp.status_code}")
    
    if staff_resp.status_code == 403:
        logging.info("PASS: Replay rejected with 403")
    else:
        logging.error(f"FAIL: Replay not rejected properly, got {staff_resp.status_code}")

if __name__ == "__main__":
    test_replay()
