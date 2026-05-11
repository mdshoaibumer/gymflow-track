"""
Seed a super admin user for the platform.

Usage:
    python -m app.scripts.seed_super_admin

Creates a super admin user with no gym association.
Idempotent — skips if a super admin already exists.
"""

import asyncio
import sys
from uuid import uuid4

from sqlalchemy import select

from app.core.database import async_session_factory
from app.core.security import hash_password
from app.models.user import User, UserRole
# Trigger all model imports via main
import app.main  # noqa


async def seed_super_admin(
    email: str = "admin@gymflow.dev",
    password: str = "SuperAdmin@2026!",
    name: str = "GymFlow Track Admin",
    phone: str = "9999999999",
) -> None:
    async with async_session_factory() as session:
        async with session.begin():
            # Check if super admin already exists
            existing = (await session.execute(
                select(User).where(
                    User.role == UserRole.SUPER_ADMIN,
                    User.email == email,
                )
            )).scalar_one_or_none()

            if existing:
                print(f"Super admin already exists: {existing.email} (id={existing.id})")
                return

            user = User(
                id=uuid4(),
                gym_id=None,
                name=name,
                email=email,
                phone=phone,
                password_hash=hash_password(password),
                role=UserRole.SUPER_ADMIN,
                is_active=True,
            )
            session.add(user)
            print(f"Super admin created: {email} (id={user.id})")
            print(f"Password: {password}")
            print("IMPORTANT: Change this password immediately in production!")


if __name__ == "__main__":
    asyncio.run(seed_super_admin())
