"""
GymFlow Auth E2E API Test Suite
Tests the full JWT lifecycle, token management, and auth flows at the API level.
"""
import asyncio
import time
import json
import httpx
import sys
import io
import base64
from datetime import datetime

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_URL = "http://localhost:8000/api/v1"

# Test credentials
TIMESTAMP = str(int(time.time()))[-6:]
TEST_EMAIL = f"authtest{TIMESTAMP}@gmail.com"
TEST_PASSWORD = "SecurePass@123"
TEST_GYM = f"AuthTestGym{TIMESTAMP}"
TEST_OWNER = "Auth Tester"
TEST_PHONE = f"9{TIMESTAMP}1234"[:10]

results = []


def log_result(test_name, passed, details="", severity=""):
    status = "PASS" if passed else "FAIL"
    results.append({
        "test": test_name,
        "passed": passed,
        "details": details,
        "severity": severity
    })
    print(f"  [{status}] {test_name}")
    if details:
        print(f"         -> {details}")
    if severity and not passed:
        print(f"         !! Severity: {severity}")


def decode_jwt_payload(token):
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload_b64 = parts[1] + "=" * (4 - len(parts[1]) % 4)
    return json.loads(base64.b64decode(payload_b64))


async def safe_request(client, method, url, **kwargs):
    """Wrapper to catch connection errors gracefully."""
    try:
        return await client.request(method, url, **kwargs)
    except (httpx.ReadError, httpx.ConnectError, httpx.RemoteProtocolError) as e:
        # Create a fake response for logging
        class FakeResponse:
            status_code = 0
            text = f"CONNECTION_ERROR: {e}"
            headers = {}
            def json(self):
                return {}
        return FakeResponse()


async def run_tests():
    async with httpx.AsyncClient(timeout=15.0) as client:
        print("\n" + "=" * 70)
        print("  GYMFLOW AUTH E2E API TEST SUITE")
        print("=" * 70)

        # ========== 1. REGISTRATION ==========
        print("\n-- 1. REGISTRATION --")

        register_payload = {
            "gym_name": TEST_GYM,
            "owner_name": TEST_OWNER,
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "phone": TEST_PHONE,
            "city": "Mumbai"
        }

        r = await safe_request(client, "POST", f"{BASE_URL}/auth/register", json=register_payload)
        log_result("Register new gym + owner", r.status_code == 201,
                   f"HTTP {r.status_code}: {r.text[:200]}")

        tokens = r.json() if r.status_code == 201 else {}
        access_token = tokens.get("access_token", "")
        refresh_token = tokens.get("refresh_token", "")

        log_result("Registration returns access_token", bool(access_token),
                   f"Token length: {len(access_token)}" if access_token else "Missing")
        log_result("Registration returns refresh_token", bool(refresh_token),
                   f"Token length: {len(refresh_token)}" if refresh_token else "Missing")
        log_result("Registration returns token_type=bearer",
                   tokens.get("token_type", "").lower() == "bearer",
                   f"Got: {tokens.get('token_type')}")

        # Validate JWT structure
        if access_token:
            parts = access_token.split(".")
            log_result("Access token is valid JWT (3 parts)", len(parts) == 3)

            payload = decode_jwt_payload(access_token)
            if payload:
                log_result("JWT contains 'sub' claim", "sub" in payload)
                log_result("JWT contains 'gym_id' claim", "gym_id" in payload)
                log_result("JWT contains 'role' claim", "role" in payload,
                           f"role: {payload.get('role')}")
                log_result("JWT role is 'owner' for registration",
                           payload.get("role") == "owner")
                log_result("JWT type is 'access'", payload.get("type") == "access")
                log_result("JWT contains 'exp' claim", "exp" in payload)

                if "exp" in payload:
                    ttl_min = (payload["exp"] - time.time()) / 60
                    log_result("Access token TTL is ~30 minutes",
                               25 < ttl_min < 35, f"TTL: {ttl_min:.1f} min")

        # ========== 2. DUPLICATE REGISTRATION ==========
        print("\n-- 2. DUPLICATE REGISTRATION --")

        # Wait for backend to recover from potential 500
        await asyncio.sleep(1)
        r = await safe_request(client, "POST", f"{BASE_URL}/auth/register", json=register_payload)
        log_result("Duplicate registration blocked (expect 400/409, not 500)",
                   r.status_code in (400, 409, 422),
                   f"HTTP {r.status_code}: {r.text[:150]}",
                   severity="MEDIUM" if r.status_code == 500 else ("HIGH" if r.status_code == 201 else ""))

        # ========== 3. VALID LOGIN ==========
        print("\n-- 3. VALID LOGIN --")

        await asyncio.sleep(0.5)  # Allow backend recovery
        login_payload = {"email": TEST_EMAIL, "password": TEST_PASSWORD}
        r = await safe_request(client, "POST", f"{BASE_URL}/auth/login", json=login_payload)
        log_result("Login with valid credentials", r.status_code == 200,
                   f"HTTP {r.status_code}: {r.text[:150]}")

        if r.status_code == 200:
            login_tokens = r.json()
            access_token = login_tokens.get("access_token", access_token)
            refresh_token = login_tokens.get("refresh_token", refresh_token)

        log_result("Login returns access_token", bool(access_token))
        log_result("Login returns refresh_token", bool(refresh_token))

        if not access_token:
            print("\n  !! NO TOKEN: Cannot continue. Aborting remaining tests.")
            return results

        headers = {"Authorization": f"Bearer {access_token}"}

        # ========== 4. INVALID LOGIN ==========
        print("\n-- 4. INVALID LOGIN --")

        r = await safe_request(client, "POST", f"{BASE_URL}/auth/login",
                              json={"email": TEST_EMAIL, "password": "WrongPassword"})
        log_result("Wrong password returns 401", r.status_code == 401,
                   f"HTTP {r.status_code}")

        r = await safe_request(client, "POST", f"{BASE_URL}/auth/login",
                              json={"email": "nonexistent@gmail.com", "password": "x"})
        log_result("Nonexistent email returns 401", r.status_code == 401,
                   f"HTTP {r.status_code}")

        error_detail = r.json().get("detail", "") if r.status_code == 401 else ""
        log_result("Error message is generic (no user enumeration)",
                   "invalid" in error_detail.lower(),
                   f"Message: {error_detail}",
                   severity="MEDIUM" if "not found" in error_detail.lower() else "")

        r = await safe_request(client, "POST", f"{BASE_URL}/auth/login", json={})
        log_result("Empty login body returns 422", r.status_code == 422)

        # SQL injection attempt
        r = await safe_request(client, "POST", f"{BASE_URL}/auth/login",
                              json={"email": "test@gmail.com", "password": "' OR 1=1 --"})
        log_result("SQL injection attempt blocked",
                   r.status_code in (401, 422), f"HTTP {r.status_code}",
                   severity="CRITICAL" if r.status_code == 200 else "")

        # ========== 5. /auth/me ENDPOINT ==========
        print("\n-- 5. /auth/me ENDPOINT --")

        r = await safe_request(client, "GET", f"{BASE_URL}/auth/me", headers=headers)
        log_result("GET /auth/me with valid token returns 200",
                   r.status_code == 200, f"HTTP {r.status_code}")

        if r.status_code == 200:
            user_data = r.json()
            for field in ["id", "gym_id", "name", "email", "role", "is_active", "phone"]:
                log_result(f"Response contains '{field}'", field in user_data)
            log_result("No password_hash leaked",
                       "password_hash" not in user_data and "password" not in user_data,
                       severity="CRITICAL" if "password_hash" in user_data else "")
            log_result("Role is 'owner'", user_data.get("role") == "owner")

        # Without token
        r = await safe_request(client, "GET", f"{BASE_URL}/auth/me")
        log_result("GET /auth/me without token returns 401/403",
                   r.status_code in (401, 403), f"HTTP {r.status_code}",
                   severity="CRITICAL" if r.status_code == 200 else "")

        # Garbage token (valid JWT format but wrong signature)
        r = await safe_request(client, "GET", f"{BASE_URL}/auth/me",
                              headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIiwidHlwZSI6ImFjY2VzcyJ9.invalid_sig"})
        log_result("GET /auth/me with forged token returns 401",
                   r.status_code == 401, f"HTTP {r.status_code}",
                   severity="CRITICAL" if r.status_code == 200 else "")

        # ========== 6. CONCURRENT /auth/me ==========
        print("\n-- 6. CONCURRENT /auth/me --")

        tasks = [safe_request(client, "GET", f"{BASE_URL}/auth/me", headers=headers) for _ in range(5)]
        responses = await asyncio.gather(*tasks)
        statuses = [r.status_code for r in responses]
        log_result("5 concurrent /auth/me all return 200",
                   all(s == 200 for s in statuses), f"Statuses: {statuses}")

        # Measure response time
        start = time.time()
        r = await safe_request(client, "GET", f"{BASE_URL}/auth/me", headers=headers)
        latency = (time.time() - start) * 1000
        log_result("/auth/me response time < 500ms",
                   latency < 500, f"Latency: {latency:.0f}ms",
                   severity="LOW" if latency >= 500 else "")

        # ========== 7. TOKEN REFRESH ==========
        print("\n-- 7. TOKEN REFRESH --")

        r = await safe_request(client, "POST", f"{BASE_URL}/auth/refresh",
                              json={"refresh_token": refresh_token})
        log_result("Token refresh returns 200", r.status_code == 200,
                   f"HTTP {r.status_code}: {r.text[:150]}")

        old_refresh = refresh_token
        if r.status_code == 200:
            new_tokens = r.json()
            new_access = new_tokens.get("access_token", "")
            new_refresh = new_tokens.get("refresh_token", "")

            log_result("Refresh returns NEW access_token",
                       bool(new_access) and new_access != access_token,
                       "Rotated" if new_access != access_token else "SAME token!")
            log_result("Refresh rotates refresh_token",
                       bool(new_refresh) and new_refresh != refresh_token,
                       "Rotated" if new_refresh != refresh_token else "SAME token!",
                       severity="HIGH" if new_refresh == refresh_token else "")

            # Verify new token works
            r2 = await safe_request(client, "GET", f"{BASE_URL}/auth/me",
                                   headers={"Authorization": f"Bearer {new_access}"})
            log_result("New access token is functional", r2.status_code == 200)

            # Reuse detection
            r3 = await safe_request(client, "POST", f"{BASE_URL}/auth/refresh",
                                   json={"refresh_token": old_refresh})
            log_result("Old refresh token reuse is blocked (reuse detection)",
                       r3.status_code == 401,
                       f"HTTP {r3.status_code}: {r3.text[:100]}",
                       severity="CRITICAL" if r3.status_code == 200 else "")

            access_token = new_access
            refresh_token = new_refresh
            headers = {"Authorization": f"Bearer {access_token}"}

        # Invalid refresh
        r = await safe_request(client, "POST", f"{BASE_URL}/auth/refresh",
                              json={"refresh_token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIiwidHlwZSI6InJlZnJlc2gifQ.bad"})
        log_result("Invalid refresh token returns 401", r.status_code == 401)

        # ========== 8. PROTECTED ROUTES ==========
        print("\n-- 8. PROTECTED ROUTES --")

        protected_routes = [
            ("GET", "/dashboard/stats"),
            ("GET", "/members"),
            ("GET", "/notifications"),
            ("GET", "/billing/subscription"),
        ]

        for method, route in protected_routes:
            r_unauth = await safe_request(client, method, f"{BASE_URL}{route}")
            r_auth = await safe_request(client, method, f"{BASE_URL}{route}", headers=headers)

            log_result(f"{method} {route} blocked without auth",
                       r_unauth.status_code in (401, 403),
                       f"Unauth: HTTP {r_unauth.status_code}",
                       severity="CRITICAL" if r_unauth.status_code == 200 else "")
            log_result(f"{method} {route} accessible with auth",
                       r_auth.status_code in (200, 403, 404),
                       f"Auth: HTTP {r_auth.status_code}")

        # ========== 9. RAPID LOGIN ATTEMPTS ==========
        print("\n-- 9. RAPID LOGIN ATTEMPTS (rate limit) --")

        rapid_statuses = []
        for i in range(15):
            r = await safe_request(client, "POST", f"{BASE_URL}/auth/login",
                                  json={"email": "brute@gmail.com", "password": "wrong"})
            rapid_statuses.append(r.status_code)

        rate_limited = any(s == 429 for s in rapid_statuses)
        log_result("Rate limiting triggers on rapid login attempts",
                   rate_limited,
                   f"Statuses: {rapid_statuses}",
                   severity="HIGH" if not rate_limited else "")

        # ========== 10. LOGOUT ==========
        print("\n-- 10. LOGOUT --")

        # Fresh login for logout test
        await asyncio.sleep(0.5)
        r = await safe_request(client, "POST", f"{BASE_URL}/auth/login", json=login_payload)
        if r.status_code == 200:
            lt = r.json()
            logout_access = lt["access_token"]
            logout_refresh = lt["refresh_token"]
            logout_headers = {"Authorization": f"Bearer {logout_access}"}

            r = await safe_request(client, "POST", f"{BASE_URL}/auth/logout",
                                  headers=logout_headers,
                                  json={"refresh_token": logout_refresh})
            log_result("Logout returns 200", r.status_code == 200,
                       f"HTTP {r.status_code}")

            # Refresh revoked
            r = await safe_request(client, "POST", f"{BASE_URL}/auth/refresh",
                                  json={"refresh_token": logout_refresh})
            log_result("Refresh fails after logout", r.status_code == 401,
                       f"HTTP {r.status_code}",
                       severity="HIGH" if r.status_code == 200 else "")

            # Access token still works (stateless)
            r = await safe_request(client, "GET", f"{BASE_URL}/auth/me",
                                  headers=logout_headers)
            log_result("Access token valid after logout (stateless JWT, expected)",
                       r.status_code == 200)

            # Logout without body (revoke all)
            r2 = await safe_request(client, "POST", f"{BASE_URL}/auth/login", json=login_payload)
            if r2.status_code == 200:
                lt2 = r2.json()
                r3 = await safe_request(client, "POST", f"{BASE_URL}/auth/logout",
                                       headers={"Authorization": f"Bearer {lt2['access_token']}"})
                log_result("Logout without body (revoke all) returns 200",
                           r3.status_code == 200)
        else:
            log_result("Login for logout test", False, f"Login failed: HTTP {r.status_code}")

        # ========== 11. CORS HEADERS ==========
        print("\n-- 11. CORS HEADERS --")

        r = await safe_request(client, "OPTIONS", f"{BASE_URL}/auth/login",
                              headers={
                                  "Origin": "http://localhost:3001",
                                  "Access-Control-Request-Method": "POST",
                                  "Access-Control-Request-Headers": "Content-Type,Authorization"
                              })
        cors_origin = r.headers.get("access-control-allow-origin", "")
        log_result("CORS allows localhost:3001",
                   "localhost:3001" in cors_origin or cors_origin == "*",
                   f"ACAO: {cors_origin}")

        cors_methods = r.headers.get("access-control-allow-methods", "")
        log_result("CORS allows POST", "POST" in cors_methods,
                   f"Methods: {cors_methods}")

        # ========== 12. FORGOT PASSWORD ==========
        print("\n-- 12. FORGOT PASSWORD --")

        r = await safe_request(client, "POST", f"{BASE_URL}/auth/forgot-password",
                              json={"email": TEST_EMAIL})
        log_result("Forgot password 200 for existing email", r.status_code == 200)

        r = await safe_request(client, "POST", f"{BASE_URL}/auth/forgot-password",
                              json={"email": "ghost@gmail.com"})
        log_result("Forgot password 200 for nonexistent (no enumeration)",
                   r.status_code == 200, severity="MEDIUM" if r.status_code != 200 else "")

        # ========== 13. RESET PASSWORD EDGE CASES ==========
        print("\n-- 13. RESET PASSWORD EDGE CASES --")

        r = await safe_request(client, "POST", f"{BASE_URL}/auth/reset-password",
                              json={"token": "invalidtokenvalue12345", "new_password": "NewPass@123"})
        log_result("Invalid reset token returns 401", r.status_code == 401,
                   f"HTTP {r.status_code}")

        # ========== 14. SECURITY HEADERS ==========
        print("\n-- 14. SECURITY HEADERS --")

        r = await safe_request(client, "GET", f"{BASE_URL}/auth/me", headers=headers)

        for hdr, expected in [("x-content-type-options", "nosniff"),
                              ("x-frame-options", None)]:
            val = r.headers.get(hdr, "")
            if expected:
                ok = val.lower() == expected.lower() if val else False
            else:
                ok = bool(val)
            log_result(f"Header '{hdr}' present", ok,
                       f"Value: {val}" if val else "Missing", severity="LOW")

        # ========== 15. EXPIRED TOKEN SIMULATION ==========
        print("\n-- 15. EXPIRED TOKEN SIMULATION --")

        # Create a manually expired JWT
        import hmac
        import hashlib
        expired_payload = {
            "sub": "fake-user-id",
            "gym_id": "fake-gym-id",
            "role": "owner",
            "type": "access",
            "exp": int(time.time()) - 3600  # 1 hour ago
        }
        # Can't sign with correct key, so this tests the signature validation too
        fake_header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
        fake_payload = base64.urlsafe_b64encode(json.dumps(expired_payload).encode()).decode().rstrip("=")
        fake_token = f"{fake_header}.{fake_payload}.fakesignature"

        r = await safe_request(client, "GET", f"{BASE_URL}/auth/me",
                              headers={"Authorization": f"Bearer {fake_token}"})
        log_result("Expired/forged token returns 401", r.status_code == 401,
                   f"HTTP {r.status_code}",
                   severity="CRITICAL" if r.status_code == 200 else "")

        # ========== SUMMARY ==========
        print("\n" + "=" * 70)
        total = len(results)
        passed_count = sum(1 for r in results if r["passed"])
        failed_count = total - passed_count

        print(f"\n  RESULTS: {passed_count}/{total} passed, {failed_count} failed")

        if failed_count:
            print(f"\n  FAILURES:")
            for r in results:
                if not r["passed"]:
                    sev = f" [{r['severity']}]" if r['severity'] else ""
                    print(f"    FAIL: {r['test']}{sev}")
                    if r["details"]:
                        print(f"          {r['details']}")

        print("\n" + "=" * 70)

        # Output JSON summary
        summary = {
            "total": total,
            "passed": passed_count,
            "failed": failed_count,
            "results": results
        }
        print(json.dumps(summary, indent=2))

        return results


if __name__ == "__main__":
    all_results = asyncio.run(run_tests())
    critical = [r for r in all_results if not r["passed"] and r["severity"] == "CRITICAL"]
    sys.exit(1 if critical else 0)
