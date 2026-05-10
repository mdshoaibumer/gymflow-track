"""
Test configuration and shared fixtures for GymFlow.

Uses a real PostgreSQL database (test-specific) to catch real constraint
violations, async behavior, and migration issues. SQLite would hide
PostgreSQL-specific behavior (UUID type, enums, async driver).

Setup:
    1. Ensure a test PostgreSQL database exists:
       CREATE DATABASE gymflow_test;
    2. Set TEST_DATABASE_URL env var or use the default below.
    3. Run: pytest

Architecture:
    - Each test gets a fresh transaction that is rolled back after the test.
    - This means tests are isolated without needing to recreate tables every time.
    - The schema is created once per test session using create_all().
"""

import asyncio
from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.base import Base
from app.models.gym import Gym
from app.models.member import Member  # noqa: F401 — ensure model is registered
from app.models.payment import Payment  # noqa: F401 — ensure model is registered
from app.models.notification import Notification  # noqa: F401 — ensure model is registered
from app.models.attendance import Attendance  # noqa: F401 — ensure model is registered
from app.models.asset import Asset, MaintenanceRecord  # noqa: F401 — ensure model is registered
from app.models.feedback import Feedback  # noqa: F401 — ensure model is registered
from app.models.subscription import SubscriptionPlan, GymSubscription, Invoice  # noqa: F401
from app.models.user import User, UserRole

# Test database URL — uses a separate database to avoid polluting dev data
# We only replace the database name at the end of the URL
_base_url, _db_name = settings.DATABASE_URL.rsplit("/", 1)
TEST_DATABASE_URL = f"{_base_url}/gymflow_test"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionFactory = async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    """Create a single event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session", autouse=True)
async def setup_database():
    """Create all tables once per test session, drop at the end.

    After create_all(), we add partial unique indexes that mirror
    migrations 011/012 so the test schema matches production.
    ORM models no longer carry these constraints (they are partial
    indexes which SQLAlchemy's MetaData.create_all cannot express).
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Partial unique indexes matching migration 011
        await conn.execute(
            sa.text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_gym_member_date "
                "ON attendance (gym_id, member_id, check_in_date) "
                "WHERE status != 'cancelled'"
            )
        )
        await conn.execute(
            sa.text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_members_gym_phone "
                "ON members (gym_id, phone) "
                "WHERE is_deleted = false"
            )
        )
        # Partial unique index matching migration 012
        await conn.execute(
            sa.text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_payments_idempotency "
                "ON payments (gym_id, idempotency_key) "
                "WHERE idempotency_key IS NOT NULL"
            )
        )
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db_session() -> AsyncSession:
    """
    Provide a transactional database session for each test.
    Rolls back after the test — ensures test isolation.
    """
    async with TestSessionFactory() as session:
        async with session.begin():
            yield session
            # Rollback after test completes — no data persists between tests
            await session.rollback()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncClient:
    """
    HTTPX async client wired to the FastAPI app with test DB session.
    """

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# === Factory Fixtures ===


@pytest.fixture
async def sample_gym(db_session: AsyncSession) -> Gym:
    """Create a test gym."""
    gym = Gym(
        id=uuid4(),
        name="Test Gym",
        slug=f"test-gym-{uuid4().hex[:8]}",
        phone="9876543210",
        email="test@gym.com",
    )
    db_session.add(gym)
    await db_session.flush()
    return gym


@pytest.fixture
async def sample_user(db_session: AsyncSession, sample_gym: Gym) -> User:
    """Create a test user (owner) linked to the sample gym."""
    user = User(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Test Owner",
        email="owner@testgym.com",
        phone="9876543210",
        password_hash=hash_password("TestPass123"),
        role=UserRole.OWNER,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
def auth_headers(sample_user: User, sample_gym: Gym) -> dict[str, str]:
    """Generate valid auth headers for the sample user (OWNER)."""
    token = create_access_token(sample_user.id, sample_gym.id, sample_user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def other_gym(db_session: AsyncSession) -> Gym:
    """Create a SECOND gym for tenant isolation tests."""
    gym = Gym(
        id=uuid4(),
        name="Other Gym",
        slug=f"other-gym-{uuid4().hex[:8]}",
        phone="9000000000",
        email="other@gym.com",
    )
    db_session.add(gym)
    await db_session.flush()
    return gym


@pytest.fixture
async def other_user(db_session: AsyncSession, other_gym: Gym) -> User:
    """Create a user in the OTHER gym for isolation tests."""
    user = User(
        id=uuid4(),
        gym_id=other_gym.id,
        name="Other Owner",
        email="owner@othergym.com",
        phone="9000000000",
        password_hash=hash_password("TestPass123"),
        role=UserRole.OWNER,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
def other_auth_headers(other_user: User, other_gym: Gym) -> dict[str, str]:
    """Auth headers for the OTHER gym's user."""
    token = create_access_token(other_user.id, other_gym.id, other_user.role.value)
    return {"Authorization": f"Bearer {token}"}


# === Role-Specific Fixtures ===


@pytest.fixture
async def admin_user(db_session: AsyncSession, sample_gym: Gym) -> User:
    """Create an ADMIN user in the sample gym."""
    user = User(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Test Admin",
        email="admin@testgym.com",
        phone="9876543211",
        password_hash=hash_password("TestPass123"),
        role=UserRole.ADMIN,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
def admin_headers(admin_user: User, sample_gym: Gym) -> dict[str, str]:
    """Auth headers for the ADMIN user."""
    token = create_access_token(admin_user.id, sample_gym.id, admin_user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def staff_user(db_session: AsyncSession, sample_gym: Gym) -> User:
    """Create a STAFF user in the sample gym."""
    user = User(
        id=uuid4(),
        gym_id=sample_gym.id,
        name="Test Staff",
        email="staff@testgym.com",
        phone="9876543212",
        password_hash=hash_password("TestPass123"),
        role=UserRole.STAFF,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
def staff_headers(staff_user: User, sample_gym: Gym) -> dict[str, str]:
    """Auth headers for the STAFF user."""
    token = create_access_token(staff_user.id, sample_gym.id, staff_user.role.value)
    return {"Authorization": f"Bearer {token}"}
