import httpx
import asyncio

async def test_unauthorized():
    url = "http://127.0.0.1:8000/api/v1/members"
    print(f"Testing unauthorized access to {url}...")
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

if __name__ == "__main__":
    asyncio.run(test_unauthorized())
