"""
Seed a super admin user for the platform.

Usage:
    SUPER_ADMIN_PASSWORD=YourSecurePass python -m app.scripts.seed_super_admin

Creates a super admin user with no gym association.
Idempotent — skips if a super admin already exists.
"""

import asyncio
import os
import secrets
import string
from uuid import uuid4

from sqlalchemy import select

from app.core.database import async_session_factory
from app.core.security import hash_password
from app.models.user import User, UserRole
# Trigger all model imports via main
import app.main  # noqa


def _generate_secure_password(length: int = 20) -> str:
    """Generate a cryptographically secure random password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    while True:
        pwd = ''.join(secrets.choice(alphabet) for _ in range(length))
        # Ensure it meets complexity requirements
        if (any(c.isupper() for c in pwd) and any(c.islower() for c in pwd)
                and any(c.isdigit() for c in pwd) and any(c in "!@#$%&*" for c in pwd)):
            return pwd


async def seed_super_admin(
    email: str = "admin@gymflowtrack.in",
    name: str = "GymFlowTrack Admin",
    phone: str = "9999999999",
) -> None:
    # Read password from env var or generate a secure random one
    password = os.environ.get("SUPER_ADMIN_PASSWORD")
    generated = False
    if not password:
        password = _generate_secure_password()
        generated = True

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
            if generated:
                print(f"Generated password: {password}")
                print("IMPORTANT: Save this password now — it will NOT be shown again!")
            else:
                print("Password set from SUPER_ADMIN_PASSWORD env var.")


if __name__ == "__main__":
    asyncio.run(seed_super_admin())
