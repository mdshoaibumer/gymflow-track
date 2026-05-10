import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from passlib.context import CryptContext

DATABASE_URL = "postgresql+asyncpg://gymflow:gymflow@localhost:5432/gymflow"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def reset_passwords():
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    
    new_hash = pwd_context.hash("TestPass123")
    
    async with async_session() as session:
        await session.execute(
            text("UPDATE users SET password_hash = :hash WHERE email IN ('admin@test.com', 'staff@test.com', 'owner2@test.com')"),
            {"hash": new_hash}
        )
        await session.commit()
        print("Passwords reset to 'TestPass123' for test users.")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(reset_passwords())
