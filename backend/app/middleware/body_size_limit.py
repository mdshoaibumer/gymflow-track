"""
Request body size limit middleware.

Protects against oversized payloads that could exhaust server memory.
Default limit: 1MB (sufficient for JSON APIs; CSV upload endpoint is
exempted since it has its own file-size validation).

Defense layers:
1. This middleware checks Content-Length header (fast rejection)
2. Uvicorn --limit-request-body flag as server-level fallback
3. CSV endpoint has its own 1MB limit in _read_csv_upload()

Note: Chunked transfer encoding without Content-Length is handled by
uvicorn's --limit-request-body flag. This middleware provides a
faster rejection path for well-behaved clients that send Content-Length.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

MAX_BODY_BYTES = 1_048_576  # 1 MB

# Paths that need larger body limits (e.g. CSV upload)
_EXEMPT_PATHS = frozenset({
    "/api/v1/onboarding/import/upload",
    "/api/v1/onboarding/import/detect",
    "/api/v1/onboarding/import/preview",
})


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH"):
            if request.url.path not in _EXEMPT_PATHS:
                content_length = request.headers.get("content-length")
                if content_length:
                    try:
                        if int(content_length) > MAX_BODY_BYTES:
                            return JSONResponse(
                                status_code=413,
                                content={"detail": "Request body too large (max 1 MB)"},
                            )
                    except ValueError:
                        return JSONResponse(
                            status_code=400,
                            content={"detail": "Invalid Content-Length header"},
                        )
        return await call_next(request)
