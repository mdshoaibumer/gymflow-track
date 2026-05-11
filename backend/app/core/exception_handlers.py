"""
Global exception handlers that translate domain exceptions into HTTP responses.

This is the ONLY place where domain exceptions are coupled to HTTP status codes.
Every other layer (services, repositories) remains transport-agnostic.

Security: Unhandled exceptions return a generic 500 message to prevent
leaking stack traces, database errors, or internal implementation details.
"""

import logging

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    AccountDisabledError,
    AlreadyExistsError,
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    GymFlowException,
    NotFoundError,
    ValidationError,
)

logger = logging.getLogger("gymflow.errors")


async def gymflow_exception_handler(request: Request, exc: GymFlowException) -> JSONResponse:
    """Map domain exceptions to HTTP status codes."""
    status_code = _get_status_code(exc)
    return JSONResponse(
        status_code=status_code,
        content={"detail": exc.detail},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unhandled exceptions — prevents stack trace leakage.

    Logs the full error server-side for debugging but returns only a
    generic message to the client. This prevents leaking:
    - Database error details (table names, constraint names)
    - File paths and line numbers
    - Third-party library internals
    """
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: {exc}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Please try again later."},
    )


def _get_status_code(exc: GymFlowException) -> int:
    mapping: dict[type, int] = {
        NotFoundError: 404,
        AlreadyExistsError: 409,
        ConflictError: 409,
        AuthenticationError: 401,
        AuthorizationError: 403,
        AccountDisabledError: 403,
        ValidationError: 422,
    }
    return mapping.get(type(exc), 500)
