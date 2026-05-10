"""
Cache abstraction for GymFlow.

Provides a simple key-value cache interface with TTL support.
Default implementation is in-memory (dict-based) — suitable for
single-process deployments.

Scaling path:
- Single worker (MVP): InMemoryCache works perfectly
- Multiple workers: Swap to RedisCacheBackend (same interface)
- The consuming code (rate limiter, subscription cache, user-active
  cache) never imports a concrete backend — only the abstract interface.

To switch to Redis:
1. pip install redis
2. Implement RedisCacheBackend below
3. Change get_cache_backend() to return RedisCacheBackend
4. All middleware/dependencies use the same interface — zero changes needed
"""

import time
from abc import ABC, abstractmethod
from collections import defaultdict


class CacheBackend(ABC):
    """Abstract cache interface. All cache consumers use this."""

    @abstractmethod
    def get(self, key: str) -> str | None:
        """Get a cached value. Returns None if expired or missing."""
        ...

    @abstractmethod
    def set(self, key: str, value: str, ttl_seconds: int = 60) -> None:
        """Set a value with TTL."""
        ...

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove a key from the cache."""
        ...

    @abstractmethod
    def increment_window(self, key: str, window_seconds: int = 60) -> int:
        """Increment a sliding-window counter. Returns current count within the window."""
        ...


class InMemoryCache(CacheBackend):
    """Dict-based cache — single-process only, zero dependencies."""

    def __init__(self, max_size: int = 5000):
        self._store: dict[str, tuple[str, float, int]] = {}  # key -> (value, timestamp, ttl)
        self._counters: dict[str, list[float]] = defaultdict(list)
        self._max_size = max_size

    def get(self, key: str) -> str | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, ts, ttl = entry
        if time.time() - ts > ttl:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: str, ttl_seconds: int = 60) -> None:
        if len(self._store) >= self._max_size:
            self._evict_stale()
        self._store[key] = (value, time.time(), ttl_seconds)

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def increment_window(self, key: str, window_seconds: int = 60) -> int:
        now = time.time()
        cutoff = now - window_seconds
        entries = self._counters[key]
        # Prune old entries
        self._counters[key] = [t for t in entries if t > cutoff]
        self._counters[key].append(now)

        # Periodic cleanup of stale keys
        if len(self._counters) > 1000:
            stale = [k for k, v in self._counters.items() if not v or v[-1] < cutoff]
            for k in stale:
                del self._counters[k]

        return len(self._counters[key])

    def _evict_stale(self) -> None:
        now = time.time()
        stale = [k for k, (_, ts, ttl) in self._store.items() if now - ts > ttl]
        for k in stale:
            del self._store[k]


# --- Singleton ---

_cache: CacheBackend | None = None


def get_cache_backend() -> CacheBackend:
    """Return the application-wide cache backend.

    To switch to Redis, change this to return a RedisCacheBackend instance.
    """
    global _cache
    if _cache is None:
        _cache = InMemoryCache()
    return _cache


# --- Future Redis implementation (uncomment when needed) ---
#
# import redis.asyncio as redis
#
# class RedisCacheBackend(CacheBackend):
#     def __init__(self, url: str = "redis://localhost:6379"):
#         self._redis = redis.from_url(url, decode_responses=True)
#
#     def get(self, key: str) -> str | None:
#         # Use sync wrapper or async variant
#         ...
#
#     def set(self, key: str, value: str, ttl_seconds: int = 60) -> None:
#         ...
#
#     def delete(self, key: str) -> None:
#         ...
#
#     def increment_window(self, key: str, window_seconds: int = 60) -> int:
#         # Use Redis ZRANGEBYSCORE + ZADD for sliding window
#         ...
