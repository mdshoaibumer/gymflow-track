"""
Rate limiting middleware — brute-force protection for auth endpoints.

Implementation: In-memory sliding window counter per IP address.
No Redis/external storage needed at MVP scale (single-process deployment).

Rate tiers:
- Auth endpoints (/api/v1/auth/*): Strict (10/min default) — prevent credential stuffing
- General API: Moderate (100/min default) — prevent abuse
- Health endpoints: No limit

Why in-memory is acceptable for MVP:
- GymFlow runs as a single uvicorn process (not clustered workers)
- Counter resets on restart (acceptable — rate limits are abuse prevention, not billing)
- When scaling to multiple workers, swap to a Redis-backed implementation
  with the same middleware interface

Security reasoning:
- Credential stuffing attacks hit /login with thousands of attempts
- Without rate limiting, an attacker can brute-force weak passwords
- 10 attempts/minute is generous for legitimate users, blocks automated attacks
- Returns 429 with Retry-After header (standard HTTP)
"""

import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.cache import get_cache_backend
from app.core.config import settings

logger = logging.getLogger("gymflow.security")

# Window duration for sliding-window counters
_WINDOW_SECONDS = 60


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding window rate limiter.

    How it works:
    1. On each request, record timestamp for the client IP
    2. Count requests within the last 60 seconds
    3. If over limit, return 429 Too Many Requests
    4. Auth endpoints have a stricter limit than general API

    Evasion considerations:
    - Proxy/load balancer: Use X-Forwarded-For if behind a reverse proxy
    - Distributed attacks: At scale, move to Redis-backed or Cloudflare WAF
    - For MVP, IP-based is sufficient protection
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip preflight requests
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path

        # Skip rate limiting for health checks
        if path.startswith("/health"):
            return await call_next(request)

        # Determine client IP (respect proxy headers in production)
        client_ip = self._get_client_ip(request)

        # Choose rate limit tier
        is_auth = path.startswith("/api/v1/auth")
        cache = get_cache_backend()

        if is_auth:
            key = f"rl:auth:{client_ip}"
            limit = settings.RATE_LIMIT_AUTH
        else:
            key = f"rl:api:{client_ip}"
            limit = settings.RATE_LIMIT_API

        count = cache.increment_window(key, _WINDOW_SECONDS)

        if count > limit:
            logger.warning(
                f"Rate limit exceeded: {client_ip} on {path} "
                f"({count}/{limit} in {_WINDOW_SECONDS}s)",
                extra={"client_ip": client_ip, "path": path},
            )
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."},
                headers={"Retry-After": str(_WINDOW_SECONDS)},
            )

        return await call_next(request)

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """
        Extract client IP, respecting proxy headers only when configured.

        TRUST_PROXY_HEADERS must be enabled in settings for X-Forwarded-For
        to be respected. Without this, attackers can spoof the header to
        bypass rate limits.

        In production behind Railway/Render/Fly reverse proxy:
        - Enable TRUST_PROXY_HEADERS=true
        - X-Forwarded-For contains the real client IP
        - request.client.host is the proxy IP
        """
        if settings.TRUST_PROXY_HEADERS:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                # X-Forwarded-For: client, proxy1, proxy2 — take the first
                return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
