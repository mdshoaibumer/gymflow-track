import httpx
import asyncio
import time

async def test_rate_limit():
    url = "http://127.0.0.1:8000/api/v1/auth/login"
    payload = {
        "email": "qa@test.com",
        "password": "WrongPassword123"
    }
    
    print(f"Testing rate limit on {url}...")
    for i in range(15):
        try:
            start = time.time()
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload)
            elapsed = time.time() - start
            print(f"Request {i+1}: Status {response.status_code} ({elapsed:.2f}s)")
            if response.status_code == 429:
                print("SUCCESS: Rate limit triggered!")
                print(f"Response: {response.json()}")
                print(f"Retry-After: {response.headers.get('Retry-After')}")
                return
        except Exception as e:
            print(f"Error on request {i+1}: {e}")
    
    print("FAILURE: Rate limit NOT triggered after 15 attempts.")

if __name__ == "__main__":
    asyncio.run(test_rate_limit())
