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

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

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
)

# Routes that need full access (write operations blocked in read-only mode)
READ_ONLY_ALLOWED_METHODS = {"GET", "HEAD", "OPTIONS"}


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

        # Get the access level from request state (set by auth dependency)
        # If no access level is set, allow the request (pre-auth routes)
        access_level = getattr(request.state, "subscription_access_level", None)

        if access_level is None:
            # No subscription check yet — will be done in the dependency
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
