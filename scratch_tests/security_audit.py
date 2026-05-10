import httpx
import asyncio
import time
import json
from uuid import uuid4

BASE_URL = "http://127.0.0.1:8000/api/v1"

async def test_brute_force():
    print("\n--- Testing Brute Force Protection ---")
    client = httpx.AsyncClient()
    email = f"brute_{uuid4()}@test.com"
    for i in range(12):
        resp = await client.post(f"{BASE_URL}/auth/login", json={"email": email, "password": "wrongpassword"})
        print(f"Attempt {i+1}: {resp.status_code}")
        if resp.status_code == 429:
            print("SUCCESS: Rate limit (429) hit!")
            return
    print("FAILURE: Rate limit NOT hit after 12 attempts.")

async def test_sql_injection():
    print("\n--- Testing SQL Injection ---")
    client = httpx.AsyncClient()
    payloads = [
        "' OR '1'='1",
        "admin@test.com' OR 1=1 --",
        "admin@test.com' AND (SELECT 1 FROM (SELECT(SLEEP(2)))a)--",
    ]
    for p in payloads:
        start = time.time()
        resp = await client.post(f"{BASE_URL}/auth/login", json={"email": p, "password": "password"})
        duration = time.time() - start
        print(f"Payload: {p} | Status: {resp.status_code} | Duration: {duration:.2f}s")
        if duration > 1.5:
            print("WARNING: Potential timing-based SQLi detected!")

async def test_auth_bypass():
    print("\n--- Testing Authorization Bypass ---")
    client = httpx.AsyncClient()
    
    # 1. Access protected route without token
    resp = await client.get(f"{BASE_URL}/auth/me")
    print(f"No token access /auth/me: {resp.status_code} (Expected 401)")
    
    # 2. Access with malformed token
    resp = await client.get(f"{BASE_URL}/auth/me", headers={"Authorization": "Bearer not-a-token"})
    print(f"Malformed token access /auth/me: {resp.status_code} (Expected 401)")

async def test_token_tampering():
    print("\n--- Testing Token Tampering ---")
    # This requires a valid token first.
    # We'll register a new gym/owner for this.
    client = httpx.AsyncClient()
    reg_data = {
        "gym_name": f"Security Test Gym {uuid4()}",
        "owner_name": "Auditor",
        "phone": "9876543210",
        "email": f"auditor_{uuid4()}@test.com",
        "password": "StrongPass123!",
        "city": "Test City"
    }
    resp = await client.post(f"{BASE_URL}/auth/register", json=reg_data)
    if resp.status_code != 201:
        print(f"Failed to register for token tampering test: {resp.text}")
        return
    
    tokens = resp.json()
    access_token = tokens["access_token"]
    
    # Tamper with the token (change a character in the signature or payload)
    parts = access_token.split(".")
    # parts[1] is payload. Let's change a char in signature (parts[2])
    tampered_token = f"{parts[0]}.{parts[1]}.{parts[2][:-1]}X"
    
    resp = await client.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {tampered_token}"})
    print(f"Tampered token access: {resp.status_code} (Expected 401)")

async def test_refresh_token_reuse():
    print("\n--- Testing Refresh Token Reuse ---")
    client = httpx.AsyncClient()
    reg_data = {
        "gym_name": f"Refresh Test Gym {uuid4()}",
        "owner_name": "Refresher",
        "phone": "9876543211",
        "email": f"refresher_{uuid4()}@test.com",
        "password": "StrongPass123!",
        "city": "Test City"
    }
    resp = await client.post(f"{BASE_URL}/auth/register", json=reg_data)
    tokens = resp.json()
    refresh_token = tokens["refresh_token"]
    
    # 1. Use refresh token once
    resp1 = await client.post(f"{BASE_URL}/auth/refresh", json={"refresh_token": refresh_token})
    print(f"First refresh: {resp1.status_code} (Expected 200)")
    new_tokens = resp1.json()
    
    # 2. Use the SAME refresh token again
    resp2 = await client.post(f"{BASE_URL}/auth/refresh", json={"refresh_token": refresh_token})
    print(f"Second refresh (reuse): {resp2.status_code} (Expected 401)")
    
    # 3. Check if all sessions are revoked (The new access token from step 1 should now be invalid)
    new_access = new_tokens["access_token"]
    resp3 = await client.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    # Wait, the access token is stateless. Revocation only affects the refresh token family.
    # Unless the system has an access token blacklist.
    print(f"New access token status after reuse detection: {resp3.status_code}")

async def run_all():
    await test_brute_force()
    await test_sql_injection()
    await test_auth_bypass()
    await test_token_tampering()
    await test_refresh_token_reuse()

if __name__ == "__main__":
    asyncio.run(run_all())
