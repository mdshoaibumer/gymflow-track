"""
Tests for app.core.cache — InMemoryCache implementation.

Coverage:
1. Basic get/set/delete operations
2. TTL expiration
3. increment_window sliding window counter
4. Cache eviction when max_size is reached
5. get_cache_backend singleton
"""

import time
from unittest.mock import patch

import pytest

from app.core.cache import InMemoryCache, get_cache_backend


class TestInMemoryCacheBasic:
    """Basic CRUD operations on InMemoryCache."""

    def test_set_and_get(self):
        cache = InMemoryCache()
        cache.set("key1", "value1", ttl_seconds=60)
        assert cache.get("key1") == "value1"

    def test_get_missing_key_returns_none(self):
        cache = InMemoryCache()
        assert cache.get("nonexistent") is None

    def test_delete_key(self):
        cache = InMemoryCache()
        cache.set("key1", "value1", ttl_seconds=60)
        cache.delete("key1")
        assert cache.get("key1") is None

    def test_delete_nonexistent_key_no_error(self):
        cache = InMemoryCache()
        cache.delete("nonexistent")  # Should not raise

    def test_overwrite_key(self):
        cache = InMemoryCache()
        cache.set("key1", "old", ttl_seconds=60)
        cache.set("key1", "new", ttl_seconds=60)
        assert cache.get("key1") == "new"


class TestInMemoryCacheTTL:
    """TTL and expiration behavior."""

    def test_expired_key_returns_none(self):
        cache = InMemoryCache()
        cache.set("key1", "value1", ttl_seconds=1)
        # Manually expire by modifying the internal timestamp
        key_data = cache._store["key1"]
        cache._store["key1"] = (key_data[0], time.time() - 10, key_data[2])
        assert cache.get("key1") is None

    def test_non_expired_key_returns_value(self):
        cache = InMemoryCache()
        cache.set("key1", "value1", ttl_seconds=3600)
        assert cache.get("key1") == "value1"


class TestInMemoryCacheWindow:
    """Sliding window counter (used by rate limiter)."""

    def test_increment_window_returns_count(self):
        cache = InMemoryCache()
        count = cache.increment_window("rate:user1", window_seconds=60)
        assert count == 1

    def test_increment_window_accumulates(self):
        cache = InMemoryCache()
        cache.increment_window("rate:user1", window_seconds=60)
        cache.increment_window("rate:user1", window_seconds=60)
        count = cache.increment_window("rate:user1", window_seconds=60)
        assert count == 3

    def test_increment_window_expired_entries_pruned(self):
        cache = InMemoryCache()
        # Add entries that are "old"
        cache._counters["rate:user1"] = [time.time() - 120, time.time() - 100]
        count = cache.increment_window("rate:user1", window_seconds=60)
        # Old entries should be pruned, only the new one counts
        assert count == 1

    def test_separate_keys_are_independent(self):
        cache = InMemoryCache()
        cache.increment_window("rate:user1", window_seconds=60)
        cache.increment_window("rate:user1", window_seconds=60)
        count = cache.increment_window("rate:user2", window_seconds=60)
        assert count == 1


class TestInMemoryCacheEviction:
    """Eviction behavior when max_size is reached."""

    def test_eviction_removes_stale_entries(self):
        cache = InMemoryCache(max_size=3)
        # Fill cache
        cache.set("key1", "v1", ttl_seconds=1)
        cache.set("key2", "v2", ttl_seconds=3600)
        cache.set("key3", "v3", ttl_seconds=3600)

        # Expire key1 manually
        data = cache._store["key1"]
        cache._store["key1"] = (data[0], time.time() - 10, data[2])

        # Adding a 4th key triggers eviction of stale entries
        cache.set("key4", "v4", ttl_seconds=3600)
        assert cache.get("key1") is None
        assert cache.get("key4") == "v4"


class TestGetCacheBackend:
    """Singleton cache backend getter."""

    def test_returns_in_memory_cache(self):
        backend = get_cache_backend()
        assert isinstance(backend, InMemoryCache)

    def test_returns_same_instance(self):
        a = get_cache_backend()
        b = get_cache_backend()
        assert a is b
