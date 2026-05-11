import asyncio
from app.core.database import async_session_factory
from sqlalchemy import text

async def check():
    async with async_session_factory() as s:
        res = await s.execute(text("SELECT * FROM subscription_plans"))
        columns = res.keys()
        for row in res.fetchall():
            print(dict(zip(columns, row)))

if __name__ == "__main__":
    asyncio.run(check())
