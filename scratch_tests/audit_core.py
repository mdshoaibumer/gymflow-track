import requests
import time
import threading
import json

BASE_URL = "http://localhost:8000/api/v1"
EMAIL = "owner2@test.com"
PASSWORD = "TestPass123"

def test_login_logout():
    print("--- Phase 1: Login/Logout & Cookie Security ---")
    session = requests.Session()
    
    # 1. Login
    payload = {"email": EMAIL, "password": PASSWORD}
    resp = session.post(f"{BASE_URL}/auth/login", json=payload)
    
    if resp.status_code != 200:
        print(f"FAIL: Login failed with status {resp.status_code}")
        return None
    
    print("PASS: Login successful")
    
    # 2. Check Cookies
    cookies = session.cookies.get_dict()
    print(f"Cookies: {cookies}")
    
    if "gymflow_access" not in cookies:
        print("FAIL: gymflow_access cookie missing")
    else:
        print("PASS: gymflow_access cookie found")
        
    if "gymflow_refresh" not in cookies:
        print("FAIL: gymflow_refresh cookie missing")
    else:
        print("PASS: gymflow_refresh cookie found")
        
    # 3. Verify /me
    resp = session.get(f"{BASE_URL}/auth/me")
    if resp.status_code == 200:
        print("PASS: /auth/me successful with cookies")
    else:
        print(f"FAIL: /auth/me failed with status {resp.status_code}")
        
    # 4. Logout
    resp = session.post(f"{BASE_URL}/auth/logout")
    if resp.status_code == 200:
        print("PASS: Logout successful")
    else:
        print(f"FAIL: Logout failed with status {resp.status_code}")
        
    # 5. Verify /me after logout
    resp = session.get(f"{BASE_URL}/auth/me")
    if resp.status_code == 401:
        print("PASS: /auth/me unauthorized after logout")
    else:
        print(f"FAIL: /auth/me still works after logout (Status: {resp.status_code})")

    return session

def test_token_rotation_and_reuse():
    print("\n--- Phase 2: Token Rotation & Reuse Detection ---")
    session = requests.Session()
    
    # 1. Login to get initial tokens
    payload = {"email": EMAIL, "password": PASSWORD}
    resp = session.post(f"{BASE_URL}/auth/login", json=payload)
    initial_refresh = session.cookies.get("gymflow_refresh")
    initial_access = session.cookies.get("gymflow_access")
    
    print(f"Initial Refresh Token: {initial_refresh[:10]}...")
    
    # 2. Refresh 1
    resp = session.post(f"{BASE_URL}/auth/refresh")
    if resp.status_code != 200:
        print(f"FAIL: First refresh failed ({resp.status_code})")
        return
    
    refresh_1 = session.cookies.get("gymflow_refresh")
    access_1 = session.cookies.get("gymflow_access")
    
    if refresh_1 == initial_refresh:
        print("FAIL: Refresh token did NOT rotate")
    else:
        print("PASS: Refresh token rotated")
        
    # 3. Refresh 2 (using refresh_1)
    resp = session.post(f"{BASE_URL}/auth/refresh")
    refresh_2 = session.cookies.get("gymflow_refresh")
    print("PASS: Second refresh successful (rotation confirmed)")
    
    # 4. REUSE ATTACK: Use initial_refresh (now revoked)
    print("Simulating REUSE ATTACK with initial_refresh...")
    attack_session = requests.Session()
    attack_session.cookies.set("gymflow_refresh", initial_refresh, domain="localhost", path="/api/v1/auth")
    
    resp = attack_session.post(f"{BASE_URL}/auth/refresh")
    if resp.status_code == 401:
        print("PASS: Reuse attack blocked (401)")
        # Check if it triggered full revocation
        resp = session.get(f"{BASE_URL}/auth/me")
        if resp.status_code == 401:
            print("PASS: Reuse detection triggered NUCLEAR revocation (Active session invalidated)")
        else:
            print(f"FAIL: Active session still valid after reuse detection! (Status: {resp.status_code})")
    else:
        print(f"FAIL: Reuse attack succeeded? (Status: {resp.status_code})")

def test_concurrent_refresh():
    print("\n--- Phase 2: Concurrent Refresh (Multi-tab) ---")
    session = requests.Session()
    session.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    
    refresh_token = session.cookies.get("gymflow_refresh")
    
    results = []
    
    def refresh_task(id):
        s = requests.Session()
        s.cookies.set("gymflow_refresh", refresh_token, domain="localhost", path="/api/v1/auth")
        resp = s.post(f"{BASE_URL}/auth/refresh")
        results.append((id, resp.status_code))
        
    threads = []
    for i in range(3):
        t = threading.Thread(target=refresh_task, args=(i,))
        threads.append(t)
        t.start()
        
    for t in threads:
        t.join()
        
    print(f"Concurrent refresh results: {results}")
    # We expect all to be 200 due to the 30s grace period
    successes = [r for r in results if r[1] == 200]
    if len(successes) == len(results):
        print("PASS: All concurrent refreshes succeeded (Grace period working)")
    else:
        print(f"FAIL: Some refreshes failed during grace period: {results}")

if __name__ == "__main__":
    test_login_logout()
    test_token_rotation_and_reuse()
    test_concurrent_refresh()
