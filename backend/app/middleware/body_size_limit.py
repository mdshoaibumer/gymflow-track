"""
Request body size limit middleware.

Protects against oversized payloads that could exhaust server memory.
Default limit: 1MB (sufficient for JSON APIs; CSV upload endpoint is
exempted since it has its own file-size validation).
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

MAX_BODY_BYTES = 1_048_576  # 1 MB

# Paths that need larger body limits (e.g. CSV upload)
_EXEMPT_PATHS = frozenset({"/api/v1/onboarding/import/upload"})


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH"):
            content_length = request.headers.get("content-length")
            if content_length and request.url.path not in _EXEMPT_PATHS:
                if int(content_length) > MAX_BODY_BYTES:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request body too large (max 1 MB)"},
                    )
        return await call_next(request)
