import asyncio
from app.core.database import async_session_factory
from app.models.platform_settings import PlatformSettings
from app.models.user import User, UserRole
from app.core.security import hash_password

from sqlalchemy import select

async def seed():
    async with async_session_factory() as session:
        async with session.begin():
            # Check if platform settings exist
            stmt = select(PlatformSettings)
            result = await session.execute(stmt)
            existing_settings = result.scalars().first()
            if not existing_settings:
                settings = PlatformSettings(
                    default_trial_days=3,
                    grace_period_days=7,
                    max_payment_retries=3,
                    max_gyms=10000,
                )
                session.add(settings)
            
            # Check if super admin exists
            stmt_user = select(User).where(User.email == "admin@gymflow.dev")
            result_user = await session.execute(stmt_user)
            existing_user = result_user.scalars().first()
            if not existing_user:
                user = User(
                    name="GymFlow Track Admin",
                    email="admin@gymflow.dev",
                    phone="9999999999",
                    password_hash=hash_password("SuperAdmin@2026!"),
                    role=UserRole.SUPER_ADMIN,
                    is_active=True,
                )
                session.add(user)

if __name__ == "__main__":
    asyncio.run(seed())
