import httpx
import asyncio

async def get_token():
    url = "http://127.0.0.1:8000/api/v1/auth/register"
    payload = {
        "gym_name": "Audit Gym Final",
        "owner_name": "Auditor",
        "phone": "9876543210",
        "email": "audit_test_final_2@test.com",
        "password": "Password123!"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload)
        if response.status_code == 201:
            print(f"Token: {response.json()}")
        else:
            print(f"Error {response.status_code}: {response.text}")

if __name__ == "__main__":
    asyncio.run(get_token())
