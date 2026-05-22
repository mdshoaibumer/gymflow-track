# ruff: noqa: E402, F401
"""
Launch the GymFlow Track backend on SQLite (no Docker/PostgreSQL needed).

Applies the same monkey-patches as manual_test.py, then starts uvicorn
on port 8000 so the Next.js frontend can talk to a real HTTP server.

Usage:
    cd backend
    python run_sqlite_server.py
"""

import json
import os

# ── Environment setup (BEFORE any app imports) ─────────────────────────
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///gymflow_dev.db")
os.environ.setdefault("DATABASE_URL_SYNC", "sqlite:///gymflow_dev.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-manual-testing-only-32chars!")
os.environ.setdefault("RAZORPAY_KEY_ID", "mock")
os.environ.setdefault("RATE_LIMIT_AUTH", "1000")
os.environ.setdefault("RATE_LIMIT_API", "10000")

# ── Monkey-patch PostgreSQL types for SQLite compatibility ─────────────
import sqlalchemy
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB as PG_JSONB


@compiles(PG_UUID, "sqlite")
def _compile_pg_uuid_sqlite(type_, compiler, **kw):
    return "VARCHAR(36)"


@compiles(PG_JSONB, "sqlite")
def _compile_pg_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


# Patch PG_UUID to handle Python UUID <-> string conversion on SQLite
_orig_uuid_bind = PG_UUID.bind_processor
_orig_uuid_result = PG_UUID.result_processor


def _patched_uuid_bind(self, dialect):
    if dialect.name == "sqlite":
        def process(value):
            if value is not None:
                return str(value)
            return value
        return process
    if _orig_uuid_bind:
        return _orig_uuid_bind(self, dialect)
    return None


def _patched_uuid_result(self, dialect, coltype):
    if dialect.name == "sqlite":
        def process(value):
            if value is not None:
                if isinstance(value, str):
                    import uuid as _uuid
                    return _uuid.UUID(value)
            return value
        return process
    if _orig_uuid_result:
        return _orig_uuid_result(self, dialect, coltype)
    return None


PG_UUID.bind_processor = _patched_uuid_bind
PG_UUID.result_processor = _patched_uuid_result

# Patch JSONB to serialize/deserialize on SQLite
_orig_jsonb_bind = PG_JSONB.bind_processor
_orig_jsonb_result = PG_JSONB.result_processor


def _patched_jsonb_bind(self, dialect):
    if dialect.name == "sqlite":
        def process(value):
            if value is not None:
                return json.dumps(value)
            return value
        return process
    if _orig_jsonb_bind:
        return _orig_jsonb_bind(self, dialect)
    return None


def _patched_jsonb_result(self, dialect, coltype):
    if dialect.name == "sqlite":
        def process(value):
            if value is not None and isinstance(value, str):
                return json.loads(value)
            return value
        return process
    if _orig_jsonb_result:
        return _orig_jsonb_result(self, dialect, coltype)
    return None


PG_JSONB.bind_processor = _patched_jsonb_bind
PG_JSONB.result_processor = _patched_jsonb_result

# Patch Enum to not use native enums on SQLite
_orig_enum_init = sqlalchemy.Enum.__init__


def _patched_enum_init(self, *args, **kwargs):
    kwargs["native_enum"] = False
    _orig_enum_init(self, *args, **kwargs)


sqlalchemy.Enum.__init__ = _patched_enum_init

# ── Patch create_async_engine to strip pool args for SQLite ────────────
from sqlalchemy.ext.asyncio import create_async_engine as _orig_create_async_engine
from sqlalchemy.pool import StaticPool
import sqlalchemy.ext.asyncio as _sa_async

_POOL_ARGS = {"pool_size", "max_overflow", "pool_timeout", "pool_pre_ping", "pool_recycle"}


def _patched_create_async_engine(url, **kw):
    url_str = str(url)
    if "sqlite" in url_str:
        kw = {k: v for k, v in kw.items() if k not in _POOL_ARGS}
        kw["poolclass"] = StaticPool
        kw.setdefault("connect_args", {})["check_same_thread"] = False
    return _orig_create_async_engine(url, **kw)


_sa_async.create_async_engine = _patched_create_async_engine

import sqlalchemy.ext.asyncio.engine as _sa_engine_mod
_sa_engine_mod.create_async_engine = _patched_create_async_engine

# Reload database module so it picks up the patched engine factory
import importlib
import app.core.database
importlib.reload(app.core.database)

# ── Create tables on startup ───────────────────────────────────────────
from app.core.database import engine as sqlite_engine
from app.models.base import Base

# Import all models so metadata knows about every table
from app.models.gym import Gym  # noqa
from app.models.user import User  # noqa
from app.models.member import Member  # noqa
from app.models.payment import Payment  # noqa
from app.models.notification import Notification  # noqa
from app.models.attendance import Attendance  # noqa
from app.models.asset import Asset, MaintenanceRecord  # noqa
from app.models.feedback import Feedback  # noqa
from app.models.subscription import SubscriptionPlan, GymSubscription, Invoice  # noqa
from app.models.auth_token import RefreshToken, PasswordResetToken  # noqa
from app.models.audit_log import AuditLog  # noqa
from app.models.platform_settings import PlatformSettings  # noqa
from app.models.custom_field import GymCustomField  # noqa

import asyncio


async def _init_db():
    """Create all tables in the SQLite file."""
    async with sqlite_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[OK] SQLite tables created")


asyncio.run(_init_db())

# ── Seed super admin & default settings ────────────────────────────────
from uuid import uuid4
from sqlalchemy import select
from app.core.security import hash_password
from app.models.user import UserRole


async def _seed_defaults():
    """Seed super admin user and platform settings if they don't exist."""
    from app.core.database import async_session_factory
    async with async_session_factory() as session:
        async with session.begin():
            # Super admin
            existing = (await session.execute(
                select(User).where(User.role == UserRole.SUPER_ADMIN)
            )).scalar_one_or_none()
            if not existing:
                admin = User(
                    id=uuid4(),
                    gym_id=None,
                    name="GymFlow Track Admin",
                    email="admin@gymflow.dev",
                    phone="9999999999",
                    password_hash=hash_password("SuperAdmin@2026!"),
                    role=UserRole.SUPER_ADMIN,
                    is_active=True,
                )
                session.add(admin)
                print("[OK] Super admin seeded: admin@gymflow.dev / SuperAdmin@2026!")
            else:
                print(f"[OK] Super admin exists: {existing.email}")

            # Platform settings
            ps = (await session.execute(
                select(PlatformSettings).limit(1)
            )).scalar_one_or_none()
            if not ps:
                session.add(PlatformSettings())
                print("[OK] Default platform settings seeded")


asyncio.run(_seed_defaults())

# ── Start uvicorn ──────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    print("\n=== GymFlow Track Backend (SQLite mode) ===")
    print("  API:  http://localhost:8000/api/v1")
    print("  Docs: http://localhost:8000/docs")
    print("  Press Ctrl+C to stop\n")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False, log_level="info")
