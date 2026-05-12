"""
Prometheus metrics middleware for GymFlow Track.

Exposes /metrics endpoint with:
- HTTP request count (by method, path, status)
- HTTP request duration histogram (by method, path)
- Active request gauge

Uses prometheus_client library (already lightweight, no external dependencies
beyond the package itself).

This module integrates with the existing middleware stack and provides
observability data that Prometheus scrapes every 15 seconds.
"""

import time

from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    generate_latest,
    CONTENT_TYPE_LATEST,
    REGISTRY,
)
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

# ── Metrics definitions ──────────────────────────────────────

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "handler", "status"],
)

REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "handler"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

REQUESTS_IN_PROGRESS = Gauge(
    "http_requests_in_progress",
    "Number of HTTP requests currently being processed",
    ["method"],
)


def _normalize_path(path: str) -> str:
    """
    Normalize request path for metric labels to prevent cardinality explosion.

    Replaces UUID-like segments and numeric IDs with placeholders.
    /api/v1/members/550e8400-... → /api/v1/members/{id}
    /api/v1/gyms/123 → /api/v1/gyms/{id}
    """
    parts = path.strip("/").split("/")
    normalized = []
    for part in parts:
        # UUID pattern (8-4-4-4-12 hex chars)
        if len(part) == 36 and part.count("-") == 4:
            normalized.append("{id}")
        # Numeric ID
        elif part.isdigit():
            normalized.append("{id}")
        else:
            normalized.append(part)
    return "/" + "/".join(normalized)


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Collect HTTP metrics for Prometheus scraping."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip metrics endpoint itself
        if request.url.path == "/metrics":
            return await call_next(request)

        method = request.method
        path = _normalize_path(request.url.path)

        REQUESTS_IN_PROGRESS.labels(method=method).inc()
        start = time.perf_counter()

        try:
            response = await call_next(request)
            status = str(response.status_code)
        except Exception:
            status = "500"
            raise
        finally:
            duration = time.perf_counter() - start
            REQUEST_COUNT.labels(method=method, handler=path, status=status).inc()
            REQUEST_DURATION.labels(method=method, handler=path).observe(duration)
            REQUESTS_IN_PROGRESS.labels(method=method).dec()

        return response


async def metrics_endpoint(request: Request) -> Response:
    """Expose Prometheus metrics at /metrics."""
    return Response(
        content=generate_latest(REGISTRY),
        media_type=CONTENT_TYPE_LATEST,
    )
