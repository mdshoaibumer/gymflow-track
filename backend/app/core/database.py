"""
Database engine and session factory.

Connection pool tuning for SaaS:
- pool_size: Base connections kept open (default 5 — fine for 10-50 concurrent users)
- max_overflow: Extra connections allowed above pool_size (default 10)
- pool_timeout: Seconds to wait for a connection (default 30)
- pool_pre_ping: Detect stale connections before use (prevents "connection reset" errors)
- pool_recycle: Recreate connections after 30 minutes (prevents PostgreSQL idle timeout kills)

Why these defaults work for MVP:
- 5+10 = 15 max connections per worker. PostgreSQL default is 100.
- Railway/Render typically limit to 20-50 connections for small plans.
- If using multiple workers, reduce pool_size proportionally.
- pool_pre_ping adds ~1ms latency but prevents cryptic connection errors.

Scaling path:
- 50-200 gyms: Increase pool_size to 10, max_overflow to 20
- 200+ gyms: Add PgBouncer as a connection pooler
- 1000+ gyms: Read replicas for dashboard queries
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG and settings.is_development,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_pre_ping=True,
    pool_recycle=1800,  # Recreate connections every 30 minutes
)

async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
