"""
Request middleware — correlation IDs, request logging, tenant context.

What this middleware does:
1. Assigns a unique request_id to every incoming request
2. Sets gym_id in log context when available (from JWT)
3. Logs request start/end with duration
4. Returns X-Request-ID header for client-side correlation

Why correlation IDs matter for SaaS:
- Customer says "I got an error at 3pm" → search logs by request_id
- Trace a single request across all log lines (service, repo, middleware)
- Platform support can ask customer for request_id from error responses

Security:
- Client can send X-Request-ID (for tracing across services) but we
  generate our own if missing — never trust client IDs blindly
- JWT is NOT decoded here (avoid double-decode overhead). gym_id is
  extracted after auth middleware runs, via the contextvars pattern.
"""

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging_config import request_id_var, gym_id_var

logger = logging.getLogger("gymflow.request")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """
    Attach request_id and timing to every request.

    Middleware ordering (outermost → innermost):
    1. RequestContextMiddleware (this) — sets request_id, logs start/end
    2. CORSMiddleware — handles preflight
    3. RateLimitMiddleware — throttles abusers
    4. Route handlers — actual business logic
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Generate or adopt request ID
        req_id = request.headers.get("x-request-id", str(uuid.uuid4())[:8])
        token = request_id_var.set(req_id)

        start = time.perf_counter()
        client_ip = request.client.host if request.client else "unknown"
        method = request.method
        path = request.url.path

        # Skip noisy health check logs
        is_health = path in ("/health", "/health/ready", "/health/live")

        if not is_health:
            logger.info(
                f"{method} {path}",
                extra={"method": method, "path": path, "client_ip": client_ip},
            )

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            logger.exception(
                f"{method} {path} → 500 ({duration_ms}ms)",
                extra={
                    "method": method, "path": path, "status_code": 500,
                    "duration_ms": duration_ms, "client_ip": client_ip,
                },
            )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 1)

        if not is_health:
            log_level = logging.WARNING if response.status_code >= 400 else logging.INFO
            logger.log(
                log_level,
                f"{method} {path} → {response.status_code} ({duration_ms}ms)",
                extra={
                    "method": method, "path": path,
                    "status_code": response.status_code,
                    "duration_ms": duration_ms, "client_ip": client_ip,
                },
            )

        # Attach request ID to response for client correlation
        response.headers["X-Request-ID"] = req_id

        request_id_var.reset(token)
        return response


def set_tenant_context(gym_id: str) -> None:
    """
    Set the gym_id in log context. Called from get_current_user dependency
    after JWT is decoded — ensures all subsequent log lines include gym_id.
    """
    gym_id_var.set(gym_id)
