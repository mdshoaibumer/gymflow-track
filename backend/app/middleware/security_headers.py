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

Not added (handled elsewhere):
- Content-Security-Policy: Complex, needs frontend coordination. Add when ready.
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

        return response
