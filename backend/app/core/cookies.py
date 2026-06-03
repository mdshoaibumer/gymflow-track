"""
HttpOnly Cookie Utilities — Secure Token Storage.

Author      : Mohammed Shoaib U
Module      : app.core.cookies

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

from fastapi import Request, Response

from app.core.config import settings


# Cookie names — prefixed to avoid collisions with other apps on same domain
ACCESS_COOKIE = "gymflow_access"
REFRESH_COOKIE = "gymflow_refresh"
PERSIST_COOKIE = "gymflow_persist"  # Tracks "remember me" preference for refresh


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    remember_me: bool = False,
) -> None:
    """Set HttpOnly auth cookies on a response.

    Called after login, register, and token refresh to deliver tokens
    securely via cookies instead of response body.

    When remember_me is False (default), cookies are session-scoped — they
    persist across page reloads but are deleted when the browser is fully closed.
    When remember_me is True, cookies are persistent with max_age, surviving
    browser restarts.
    """
    access_max_age: int | None = None
    refresh_max_age: int | None = None
    persist_max_age: int | None = None

    if remember_me:
        access_max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        refresh_max_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
        persist_max_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400

    _set_cookie(
        response,
        ACCESS_COOKIE,
        access_token,
        max_age=access_max_age,
        path="/",  # Sent with all API requests
    )
    _set_cookie(
        response,
        REFRESH_COOKIE,
        refresh_token,
        max_age=refresh_max_age,
        path="/api/v1/auth",  # Only sent to auth endpoints (minimizes exposure)
    )
    # Track persistence preference so refresh endpoint can preserve it.
    # This cookie is HttpOnly too — not sensitive, but no reason to expose to JS.
    _set_cookie(
        response,
        PERSIST_COOKIE,
        "1" if remember_me else "0",
        max_age=persist_max_age,
        path="/api/v1/auth",
    )


def get_remember_me(request: Request) -> bool:
    """Read the remember_me preference from the persist cookie."""
    return request.cookies.get(PERSIST_COOKIE) == "1"


def clear_auth_cookies(response: Response) -> None:
    """Clear auth cookies on logout. Sets expired cookies to force browser removal."""
    _delete_cookie(response, ACCESS_COOKIE, path="/")
    _delete_cookie(response, REFRESH_COOKIE, path="/api/v1/auth")
    _delete_cookie(response, PERSIST_COOKIE, path="/api/v1/auth")


def _set_cookie(
    response: Response,
    key: str,
    value: str,
    max_age: int | None,
    path: str,
) -> None:
    """Set a single HttpOnly cookie with security attributes.

    If max_age is None, the cookie becomes a session cookie (deleted on browser close).
    """
    kwargs: dict = {
        "key": key,
        "value": value,
        "path": path,
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": settings.COOKIE_SAMESITE,
    }
    if max_age is not None:
        kwargs["max_age"] = max_age
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
