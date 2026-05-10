from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

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

router = APIRouter()


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
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate user and return tokens."""
    service = AuthService(db)
    result = await service.login(data)
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
