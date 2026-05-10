import asyncio
from uuid import UUID
from sqlalchemy import select
from app.core.database import async_session_factory
from app.models.user import User
from app.models.subscription import GymSubscription

async def check():
    async with async_session_factory() as session:
        # Get user
        result = await session.execute(select(User).where(User.email == "qa@test.com"))
        user = result.scalar_one_or_none()
        if not user:
            print("User not found")
            return
        
        print(f"Gym ID: {user.gym_id}")
        
        # Get subscription
        result = await session.execute(select(GymSubscription).where(GymSubscription.gym_id == user.gym_id))
        sub = result.scalar_one_or_none()
        if not sub:
            print("No subscription found")
        else:
            print(f"Subscription Status: {sub.status}")
            print(f"Trial End: {sub.trial_end}")

if __name__ == "__main__":
    asyncio.run(check())
