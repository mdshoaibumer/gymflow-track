import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models.user import User
from app.models.gym import Gym
from app.models.member import Member
from app.models.subscription import SubscriptionPlan, GymSubscription, Invoice
from app.models.payment import Payment
from app.models.attendance import Attendance
from app.core.config import settings

async def list_users():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    
    async with async_session() as session:
        result = await session.execute(select(User.email, User.role))
        users = result.all()
        for email, role in users:
            print(f"Email: {email}, Role: {role.value}")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(list_users())
