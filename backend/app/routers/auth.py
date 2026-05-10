import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_backend
from app.core.config import settings
from app.core.cookies import ACCESS_COOKIE, REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user
from app.schemas.auth import (
    CurrentUserResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GymRegisterRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    ResetPasswordRequest,
    ResetPasswordResponse,
    TokenResponse,
)
from app.services.auth_service import AuthService

logger = logging.getLogger("gymflow.security")

router = APIRouter()

# Login-specific rate limiting: stricter than the general auth rate limiter.
# Tracks per-IP failed login attempts with progressive cooldown.
_LOGIN_MAX_ATTEMPTS = 5       # max attempts before lockout
_LOGIN_WINDOW_SECONDS = 300   # 5-minute window for tracking failures
_LOGIN_LOCKOUT_SECONDS = 300  # 5-minute lockout after exceeding limit


def _get_client_ip(request: Request) -> str:
    """Extract client IP (proxy-aware)."""
    if settings.TRUST_PROXY_HEADERS:
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()
            if client_ip and client_ip not in ("", "unknown"):
                return client_ip
    return request.client.host if request.client else "unknown"


def _check_login_rate_limit(request: Request) -> None:
    """Check login-specific rate limit. Raises 429 if exceeded."""
    cache = get_cache_backend()
    client_ip = _get_client_ip(request)

    # Check if IP is currently locked out
    lockout_key = f"login_lockout:{client_ip}"
    if cache.get(lockout_key):
        logger.warning(f"Login attempt during lockout: {client_ip}")
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Please try again in a few minutes.",
            headers={"Retry-After": str(_LOGIN_LOCKOUT_SECONDS)},
        )


def _record_login_failure(request: Request) -> None:
    """Record a failed login attempt. Triggers lockout if threshold exceeded."""
    cache = get_cache_backend()
    client_ip = _get_client_ip(request)
    fail_key = f"login_fails:{client_ip}"

    count = cache.increment_window(fail_key, _LOGIN_WINDOW_SECONDS)
    if count >= _LOGIN_MAX_ATTEMPTS:
        lockout_key = f"login_lockout:{client_ip}"
        cache.set(lockout_key, "1", _LOGIN_LOCKOUT_SECONDS)
        logger.warning(
            f"Login lockout triggered: {client_ip} ({count} failures in {_LOGIN_WINDOW_SECONDS}s)"
        )


def _clear_login_failures(request: Request) -> None:
    """Clear failed login counter on successful login."""
    cache = get_cache_backend()
    client_ip = _get_client_ip(request)
    cache.delete(f"login_fails:{client_ip}")
    cache.delete(f"login_lockout:{client_ip}")


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register_gym(
    data: GymRegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Register a new gym and create the owner account."""
    service = AuthService(db)
    result = await service.register_gym(data)
    # Set HttpOnly cookies — frontend doesn't need to touch tokens
    set_auth_cookies(response, result.access_token, result.refresh_token)
    return result


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate user and return tokens."""
    # Login-specific rate limit check (stricter than general auth middleware)
    _check_login_rate_limit(request)

    service = AuthService(db)
    try:
        result = await service.login(data)
    except Exception:
        # Record failed attempt for progressive lockout
        _record_login_failure(request)
        raise

    # Successful login — clear any prior failure counts
    _clear_login_failures(request)
    set_auth_cookies(response, result.access_token, result.refresh_token)
    return result


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Get new access token using refresh token (with rotation).

    Accepts refresh token from:
    1. HttpOnly cookie (preferred — browser-based clients)
    2. Request body (backward compat — mobile/API clients)
    """
    # Prefer cookie-based refresh token, fall back to body
    refresh_tok = request.cookies.get(REFRESH_COOKIE)

    if not refresh_tok:
        # Try reading from request body (backward compat for non-browser clients)
        try:
            body = await request.json()
            refresh_tok = body.get("refresh_token") if isinstance(body, dict) else None
        except Exception:
            pass

    if not refresh_tok:
        from app.core.exceptions import AuthenticationError
        raise AuthenticationError("No refresh token provided")

    service = AuthService(db)
    refresh_data = RefreshRequest(refresh_token=refresh_tok)
    result = await service.refresh_token(refresh_data)
    set_auth_cookies(response, result.access_token, result.refresh_token)
    return result


@router.post("/logout", status_code=200)
async def logout(
    request: Request,
    response: Response,
    data: LogoutRequest | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Revoke refresh tokens and terminate sessions.

    If refresh_token is provided (body or cookie), revokes only that token
    (single-device logout). Otherwise, revokes ALL refresh tokens
    (logout all devices).
    """
    # Prefer body token, then cookie, then None (revoke all)
    refresh_tok = None
    if data and data.refresh_token:
        refresh_tok = data.refresh_token
    elif request.cookies.get(REFRESH_COOKIE):
        refresh_tok = request.cookies.get(REFRESH_COOKIE)

    service = AuthService(db)
    await service.logout(
        user_id=current_user.user_id,
        refresh_token=refresh_tok,
    )
    # Clear HttpOnly cookies from browser
    clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    data: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Initiate password reset. Sends a reset token via email/SMS.

    Always returns 200 with a generic message to prevent email enumeration.
    In development, the reset token is logged. In production, integrate
    with your email/notification provider.
    """
    service = AuthService(db)
    message = await service.forgot_password(data.email)
    return ForgotPasswordResponse(message=message)


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Reset password using a valid reset token.

    Token is single-use and expires in 1 hour.
    On success, all existing sessions are terminated.
    """
    service = AuthService(db)
    message = await service.reset_password(data.token, data.new_password)
    return ResetPasswordResponse(message=message)


@router.get("/me", response_model=CurrentUserResponse)
async def get_me(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the currently authenticated user's profile.

    Request lifecycle:
    1. HTTPBearer extracts token from Authorization header
    2. get_current_user decodes JWT, validates type=access, extracts claims
    3. This handler fetches the user from DB — confirms they still exist/active
    4. Returns safe response (no password_hash, no internal timestamps)

    Why this endpoint matters for SaaS:
    - Frontend calls on page load to validate session
    - Confirms user wasn't deleted/disabled since last token refresh
    - Provides fresh profile data for UI rendering
    - gym_id validation prevents cross-tenant session hijacking
    """
    service = AuthService(db)
    return await service.get_current_user_profile(
        user_id=current_user.user_id,
        gym_id=current_user.gym_id,
    )
