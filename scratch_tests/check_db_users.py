import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://gymflow:gymflow@localhost:5432/gymflow"

async def check_users():
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    
    async with async_session() as session:
        result = await session.execute(text("SELECT id, email, role, gym_id, password_hash FROM users"))
        users = result.all()
        print("Users in DB:")
        for user in users:
            has_pass = "Yes" if user.password_hash else "No"
            print(f"ID: {user.id}, Email: {user.email}, Role: {user.role}, Gym ID: {user.gym_id}, Has Password: {has_pass}")
            
        result = await session.execute(text("SELECT id, name FROM gyms"))
        gyms = result.all()
        print("\nGyms in DB:")
        for gym in gyms:
            print(f"ID: {gym.id}, Name: {gym.name}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_users())
