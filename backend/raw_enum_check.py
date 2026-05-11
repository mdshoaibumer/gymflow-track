import asyncio
from app.core.database import async_session_factory
from sqlalchemy import text

async def check():
    async with async_session_factory() as s:
        res = await s.execute(text("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'plantier'"))
        for row in res.fetchall():
            print(row[0])

if __name__ == "__main__":
    asyncio.run(check())
