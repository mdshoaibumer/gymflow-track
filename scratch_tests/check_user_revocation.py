import asyncio
import os
import sys

# Add backend to path so we can import app
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import text
from app.core.database import async_session_factory

async def run():
    async with async_session_factory() as session:
        result = await session.execute(
            text("SELECT email, sessions_revoked_at, is_active FROM users WHERE email = 'user@example.com'")
        )
        row = result.fetchone()
        if row:
            print(f"Email: {row[0]}")
            print(f"Sessions Revoked At: {row[1]}")
            print(f"Is Active: {row[2]}")
            if row[1]:
                print(f"Sessions Revoked At (timestamp): {row[1].timestamp()}")
        else:
            print("User not found")

if __name__ == "__main__":
    asyncio.run(run())
