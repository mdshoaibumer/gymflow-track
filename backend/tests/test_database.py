"""
Tests for app.core.database — engine configuration and session factory.

Coverage:
1. Engine pool settings from config
2. pool_recycle is 30 minutes (1800)
3. pool_pre_ping is enabled
4. async_session_factory creates sessions with expire_on_commit=False
5. get_db commits on success, rolls back on exception
"""

import asyncio
from unittest.mock import AsyncMock, patch, MagicMock

import pytest


class TestEngineConfiguration:
    """Verify engine is created with correct pool settings."""

    def test_engine_pool_pre_ping_enabled(self):
        from app.core.database import engine
        assert engine.pool._pre_ping is True

    def test_engine_pool_recycle_is_1800(self):
        from app.core.database import engine
        assert engine.pool._recycle == 1800

    def test_engine_pool_size_from_settings(self):
        from app.core.database import engine
        from app.core.config import settings
        assert engine.pool.size() == settings.DB_POOL_SIZE

    def test_engine_max_overflow_from_settings(self):
        from app.core.database import engine
        from app.core.config import settings
        assert engine.pool._max_overflow == settings.DB_MAX_OVERFLOW


class TestSessionFactory:
    """Verify session factory configuration."""

    def test_expire_on_commit_disabled(self):
        from app.core.database import async_session_factory
        # async_sessionmaker stores this in kw or class_
        assert async_session_factory.kw.get("expire_on_commit") is False


class TestGetDb:
    """get_db generator commits on success, rolls back on error."""

    def test_commits_on_success(self):
        from app.core.database import get_db

        mock_session = AsyncMock()

        async def _run():
            with patch("app.core.database.async_session_factory") as mock_factory:
                mock_ctx = AsyncMock()
                mock_ctx.__aenter__.return_value = mock_session
                mock_ctx.__aexit__.return_value = False
                mock_factory.return_value = mock_ctx

                gen = get_db()
                session = await gen.__anext__()
                assert session is mock_session
                try:
                    await gen.__anext__()
                except StopAsyncIteration:
                    pass
                mock_session.commit.assert_awaited_once()
                mock_session.rollback.assert_not_awaited()

        asyncio.run(_run())

    def test_rolls_back_on_exception(self):
        from app.core.database import get_db

        mock_session = AsyncMock()

        async def _run():
            with patch("app.core.database.async_session_factory") as mock_factory:
                mock_ctx = AsyncMock()
                mock_ctx.__aenter__.return_value = mock_session
                mock_ctx.__aexit__.return_value = False
                mock_factory.return_value = mock_ctx

                gen = get_db()
                session = await gen.__anext__()
                # Simulate an exception being thrown into the generator
                try:
                    await gen.athrow(ValueError("test error"))
                except ValueError:
                    pass
                mock_session.rollback.assert_awaited_once()

        asyncio.run(_run())
