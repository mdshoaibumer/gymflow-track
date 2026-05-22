import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache_backend
from app.core.config import settings
from app.core.cookies import REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user
from app.schemas.auth import (
    ChangePasswordRequest,
    ChangePasswordResponse,
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
_LOGIN_MAX_ATTEMPTS = 10      # allow more attempts for real users behind shared IPs
_LOGIN_WINDOW_SECONDS = 300   # 5-minute sliding window for failure tracking
_LOGIN_LOCKOUT_SECONDS = 60   # shorter lockout — balances security vs. user friction

# Reset-password rate limiting: prevent brute-force on intercepted reset tokens.
_RESET_MAX_ATTEMPTS = 5       # max attempts per IP per window
_RESET_WINDOW_SECONDS = 300   # 5-minute sliding window

# Forgot-password rate limiting: prevent email bombing via repeated reset requests.
_FORGOT_MAX_PER_EMAIL = 3     # max requests per email per window
_FORGOT_WINDOW_SECONDS = 3600 # 1-hour sliding window
_FORGOT_MAX_PER_IP = 10       # max requests per IP per window (covers enumeration)
_FORGOT_IP_WINDOW_SECONDS = 3600


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
            detail=f"Too many login attempts. Please try again in {_LOGIN_LOCKOUT_SECONDS} seconds.",
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

    Normal logout (default): revokes the current device's refresh token.
    The short-lived access token expires naturally. Client-side guards
    prevent re-validation race conditions.

    Logout all devices (all_devices=true): revokes ALL refresh tokens and
    sets sessions_revoked_at to immediately invalidate access tokens on
    every device.
    """
    service = AuthService(db)

    if data and data.all_devices:
        # Explicit "logout everywhere" — revoke all tokens + invalidate sessions
        await service.logout(user_id=current_user.user_id, refresh_token=None)
    else:
        # Single-device logout: prefer body token, then cookie
        refresh_tok = None
        if data and data.refresh_token:
            refresh_tok = data.refresh_token
        elif request.cookies.get(REFRESH_COOKIE):
            refresh_tok = request.cookies.get(REFRESH_COOKIE)
        await service.logout(
            user_id=current_user.user_id,
            refresh_token=refresh_tok,
        )

    # Clear HttpOnly cookies from this browser
    clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    data: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Initiate password reset. Sends a reset token via email/SMS.

    Always returns 200 with a generic message to prevent email enumeration.
    Rate-limited per email (3/hour) and per IP (10/hour) to prevent email bombing.
    In development, the reset token is logged. In production, integrate
    with your email/notification provider.
    """
    cache = get_cache_backend()

    # Per-IP rate limit (prevents enumeration via many different emails)
    client_ip = _get_client_ip(request)
    ip_key = f"rl:forgot_ip:{client_ip}"
    ip_count = cache.increment_window(ip_key, _FORGOT_IP_WINDOW_SECONDS)
    if ip_count > _FORGOT_MAX_PER_IP:
        raise HTTPException(
            status_code=429,
            detail="Too many password reset requests. Please try again later.",
            headers={"Retry-After": str(_FORGOT_IP_WINDOW_SECONDS)},
        )

    # Per-email rate limit (prevents bombing a single user)
    email_norm = data.email.strip().lower()
    email_key = f"rl:forgot_email:{email_norm}"
    email_count = cache.increment_window(email_key, _FORGOT_WINDOW_SECONDS)
    if email_count > _FORGOT_MAX_PER_EMAIL:
        # Return generic success to avoid revealing whether email exists
        return ForgotPasswordResponse(
            message="If an account exists with that email, a reset link has been sent."
        )

    service = AuthService(db)
    message = await service.forgot_password(data.email)
    return ForgotPasswordResponse(message=message)


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    data: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Reset password using a valid reset token.

    Token is single-use and expires in 1 hour.
    On success, all existing sessions are terminated.
    Rate-limited to prevent brute-force on intercepted tokens.
    """
    # Rate limit: prevent brute-force attempts on reset tokens
    cache = get_cache_backend()
    client_ip = _get_client_ip(request)
    reset_key = f"rl:reset_pwd:{client_ip}"
    count = cache.increment_window(reset_key, _RESET_WINDOW_SECONDS)
    if count > _RESET_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Too many password reset attempts. Please try again later.",
            headers={"Retry-After": str(_RESET_WINDOW_SECONDS)},
        )

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


@router.post("/change-password", response_model=ChangePasswordResponse)
async def change_password(
    data: ChangePasswordRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Change password for the currently authenticated user.

    Requires the current password for verification (prevents session hijacking abuse).
    On success, all other sessions are revoked for security.
    """
    service = AuthService(db)
    message = await service.change_password(
        user_id=current_user.user_id,
        current_password=data.current_password,
        new_password=data.new_password,
    )
    return ChangePasswordResponse(message=message)
