"""
Global exception handlers that translate domain exceptions into HTTP responses.

This is the ONLY place where domain exceptions are coupled to HTTP status codes.
Every other layer (services, repositories) remains transport-agnostic.
"""

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    AccountDisabledError,
    AlreadyExistsError,
    AuthenticationError,
    AuthorizationError,
    GymFlowException,
    NotFoundError,
    ValidationError,
)


async def gymflow_exception_handler(request: Request, exc: GymFlowException) -> JSONResponse:
    """Map domain exceptions to HTTP status codes."""
    status_code = _get_status_code(exc)
    return JSONResponse(
        status_code=status_code,
        content={"detail": exc.detail},
    )


def _get_status_code(exc: GymFlowException) -> int:
    mapping: dict[type, int] = {
        NotFoundError: 404,
        AlreadyExistsError: 409,
        AuthenticationError: 401,
        AuthorizationError: 403,
        AccountDisabledError: 403,
        ValidationError: 422,
    }
    return mapping.get(type(exc), 500)
