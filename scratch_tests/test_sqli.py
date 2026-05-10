import httpx
import asyncio

async def test_sqli():
    url = "http://127.0.0.1:8000/api/v1/auth/login"
    payloads = [
        {"email": "' OR '1'='1", "password": "password"},
        {"email": "admin@test.com' --", "password": "password"},
        {"email": 'admin@test.com" OR "1"="1', "password": "password"},
    ]
    
    print(f"Testing SQLi on {url}...")
    async with httpx.AsyncClient() as client:
        for payload in payloads:
            response = await client.post(url, json=payload)
            print(f"Payload: {payload['email']} -> Status: {response.status_code}")
            if response.status_code == 200:
                print("DANGER: SQLi potentially successful!")
            else:
                print(f"Result: {response.json().get('detail')}")

if __name__ == "__main__":
    asyncio.run(test_sqli())
