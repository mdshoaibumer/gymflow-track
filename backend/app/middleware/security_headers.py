"""
Security Headers Middleware — Browser Security Policy Enforcement.

Author      : Mohammed Shoaib U
Module      : app.middleware.security_headers

Adds standard security headers to every response. These headers instruct
browsers to apply security policies that prevent common attack vectors.

Headers added:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: restricts browser feature access
- X-XSS-Protection: 0 (modern browsers use CSP instead)
- Content-Security-Policy: Restricts resource loading origins
- Cache-Control: no-store
- Strict-Transport-Security: Enforces HTTPS in production (when COOKIE_SECURE=True)
"""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        # Disable legacy XSS filter (CSP is the modern replacement)
        response.headers["X-XSS-Protection"] = "0"
        # Prevent browsers/proxies from caching authenticated API responses
        response.headers["Cache-Control"] = "no-store"

        # HSTS: enforce HTTPS for 1 year when running in production (COOKIE_SECURE=True).
        # In development (COOKIE_SECURE=False / localhost), HSTS is omitted to avoid
        # browsers caching an HTTPS-only policy for localhost.
        if settings.COOKIE_SECURE:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        # CSP policy: restrict resource loading.
        # API routes get a minimal CSP (defense-in-depth).
        # Swagger/ReDoc docs need cdn.jsdelivr.net for UI assets.
        # All other routes get strict same-origin CSP.
        if request.url.path.startswith("/api/"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; frame-ancestors 'none'"
            )
        else:
            is_docs = request.url.path in ("/docs", "/redoc", "/openapi.json") or \
                      request.url.path.startswith("/docs/") or request.url.path.startswith("/redoc/")
            if is_docs:
                response.headers["Content-Security-Policy"] = (
                    "default-src 'self'; "
                    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                    "img-src 'self' data: https://cdn.jsdelivr.net https://fastapi.tiangolo.com; "
                    "font-src 'self' https://cdn.jsdelivr.net; "
                    "connect-src 'self'; "
                    "frame-ancestors 'none'; "
                    "worker-src 'self' blob:"
                )
            else:
                response.headers["Content-Security-Policy"] = (
                    "default-src 'self'; "
                    "script-src 'self'; "
                    "style-src 'self' 'unsafe-inline'; "
                    "img-src 'self' data:; "
                    "font-src 'self'; "
                    "connect-src 'self'; "
                    "frame-ancestors 'none'"
                )

        return response