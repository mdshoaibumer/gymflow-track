"""
Subscription enforcement middleware.

Checks subscription status on every authenticated request.
Routes access levels based on billing status.

Design choices:
─────────────────
1. Middleware, not per-route decorator:
   - Consistent enforcement across ALL endpoints
   - Can't accidentally forget to add the check
   - Single place to update gating logic

2. Exempt routes (health, auth, billing, webhook):
   - Users must be able to log in even when expired
   - Billing endpoints must work to accept payment
   - Health checks are for infrastructure, not business logic

3. Read-only mode (not hard lockout):
   - Past-due/expired users can still GET data
   - They can't POST/PUT/DELETE (create or modify)
   - This preserves trust and motivates resubscription

4. Staff/admin see the same restrictions as the gym:
   - Subscription is per-gym, not per-user
   - If the gym is locked, all users in that gym are locked
"""

import logging
from typing import Callable
from uuid import UUID

from fastapi import Request
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.config import settings

logger = logging.getLogger("gymflow.subscription")

# Routes that bypass subscription checks entirely
EXEMPT_PREFIXES = (
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/v1/auth",
    "/api/v1/billing/plans",
    "/api/v1/billing/webhook",
    "/api/v1/billing/subscribe",
    "/api/v1/billing/verify",
    "/api/v1/billing/subscription",
    "/api/v1/billing/cancel",
    "/api/v1/billing/history",
    "/api/v1/billing/features",
    "/api/v1/billing/metrics",
)

# Routes that need full access (write operations blocked in read-only mode)
READ_ONLY_ALLOWED_METHODS = {"GET", "HEAD", "OPTIONS"}


def _extract_gym_id(request: Request) -> UUID | None:
    """Extract gym_id from JWT without full auth validation.

    This is intentionally lightweight — full auth is handled by the
    dependency layer. We only need the gym_id to look up subscription status.
    Returns None for unauthenticated requests (which are allowed through
    so the auth dependency can return the proper 401).
    """
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        return UUID(payload["gym_id"])
    except (JWTError, KeyError, ValueError):
        return None


class SubscriptionEnforcementMiddleware(BaseHTTPMiddleware):
    """
    Enforce subscription status on API requests.

    Access levels:
    - full: All operations allowed
    - read_only: Only GET/HEAD/OPTIONS allowed
    - locked: Only exempt routes allowed (auth, billing, health)
    """

    async def dispatch(self, request: Request, call_next: Callable):
        path = request.url.path

        # Skip exempt routes
        for prefix in EXEMPT_PREFIXES:
            if path.startswith(prefix):
                return await call_next(request)

        # Only enforce on API routes
        if not path.startswith("/api/"):
            return await call_next(request)

        # Extract gym_id from JWT
        gym_id = _extract_gym_id(request)
        if gym_id is None:
            # No valid token — let the auth dependency handle 401
            return await call_next(request)

        # Look up subscription status
        from app.core.database import async_session_factory
        from app.services.billing_service import get_access_level, get_subscription

        try:
            async with async_session_factory() as session:
                subscription = await get_subscription(session, gym_id)
                access_level = get_access_level(subscription)
        except Exception:
            # DB error — don't block the request, let downstream handle it
            logger.exception("Subscription check failed, allowing request")
            return await call_next(request)

        if access_level == "locked":
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Your subscription has expired. Please resubscribe to continue.",
                    "code": "subscription_expired",
                },
            )

        if access_level == "read_only" and request.method not in READ_ONLY_ALLOWED_METHODS:
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Your subscription is inactive. You can view data but not make changes. Please update your payment to restore full access.",
                    "code": "subscription_read_only",
                },
            )

        return await call_next(request)
