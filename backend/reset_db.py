import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def reset_db():
    if not DATABASE_URL:
        print("DATABASE_URL not found in .env")
        return

    print(f"Connecting to {DATABASE_URL}...")
    engine = create_async_engine(DATABASE_URL)
    
    async with engine.begin() as conn:
        print("Dropping all tables...")
        # This approach drops the public schema and recreates it, 
        # which is the cleanest way to wipe a Postgres DB.
        await conn.execute(text("DROP SCHEMA public CASCADE;"))
        await conn.execute(text("CREATE SCHEMA public;"))
        await conn.execute(text("GRANT ALL ON SCHEMA public TO public;"))
        print("Database reset successful.")

if __name__ == "__main__":
    asyncio.run(reset_db())
