"""
HttpOnly cookie utilities for secure token storage.

Security rationale:
- HttpOnly: Prevents JavaScript access → mitigates XSS token theft
- Secure: Ensures cookies are only sent over HTTPS (disabled in dev for localhost)
- SameSite=Lax: Blocks cross-site POST requests (CSRF protection) while
  allowing normal link navigation
- Path-scoping: Refresh token cookie only sent to /api/v1/auth paths,
  minimizing exposure surface

This replaces localStorage-based token storage. The frontend never sees
the raw token values — the browser manages cookie transmission automatically.
"""

from fastapi import Response

from app.core.config import settings


# Cookie names — prefixed to avoid collisions with other apps on same domain
ACCESS_COOKIE = "gymflow_access"
REFRESH_COOKIE = "gymflow_refresh"


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
) -> None:
    """Set HttpOnly auth cookies on a response.

    Called after login, register, and token refresh to deliver tokens
    securely via cookies instead of response body.
    """
    _set_cookie(
        response,
        ACCESS_COOKIE,
        access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",  # Sent with all API requests
    )
    _set_cookie(
        response,
        REFRESH_COOKIE,
        refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth",  # Only sent to auth endpoints (minimizes exposure)
    )


def clear_auth_cookies(response: Response) -> None:
    """Clear auth cookies on logout. Sets expired cookies to force browser removal."""
    _delete_cookie(response, ACCESS_COOKIE, path="/")
    _delete_cookie(response, REFRESH_COOKIE, path="/api/v1/auth")


def _set_cookie(
    response: Response,
    key: str,
    value: str,
    max_age: int,
    path: str,
) -> None:
    """Set a single HttpOnly cookie with security attributes."""
    kwargs = {
        "key": key,
        "value": value,
        "max_age": max_age,
        "path": path,
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": settings.COOKIE_SAMESITE,
    }
    if settings.COOKIE_DOMAIN:
        kwargs["domain"] = settings.COOKIE_DOMAIN
    response.set_cookie(**kwargs)


def _delete_cookie(response: Response, key: str, path: str) -> None:
    """Delete a cookie by setting it expired."""
    kwargs = {
        "key": key,
        "path": path,
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": settings.COOKIE_SAMESITE,
    }
    if settings.COOKIE_DOMAIN:
        kwargs["domain"] = settings.COOKIE_DOMAIN
    response.delete_cookie(**kwargs)
