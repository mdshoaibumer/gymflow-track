"""
Security headers middleware.

Adds standard security headers to every response. These headers instruct
browsers to apply security policies that prevent common attack vectors.

Headers added:
- X-Content-Type-Options: nosniff — prevents MIME type sniffing
- X-Frame-Options: DENY — prevents clickjacking via iframes
- Referrer-Policy: strict-origin-when-cross-origin — limits referrer leakage
- Permissions-Policy: restricts browser feature access
- X-XSS-Protection: 0 — modern browsers use CSP instead (legacy header)
- Content-Security-Policy: Restricts resource loading origins
- Cache-Control: no-store — prevents caching of authenticated API responses

Not added (handled elsewhere):
- Strict-Transport-Security: Set by reverse proxy (Railway/Render/Cloudflare)
"""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


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
        # CSP: restrict resource loading to same-origin
        # Only apply to non-API routes (e.g. docs, redoc, health) as it can block
        # cross-origin API calls from the frontend even with CORS enabled.
        if not request.url.path.startswith("/api/"):
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
