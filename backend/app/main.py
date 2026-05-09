import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.exception_handlers import gymflow_exception_handler
from app.core.exceptions import GymFlowException
from app.core.logging_config import setup_logging
from app.core.scheduler import start_scheduler, stop_scheduler, configure_provider
from app.middleware.request_context import RequestContextMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.subscription_enforcement import SubscriptionEnforcementMiddleware
from app.middleware.body_size_limit import BodySizeLimitMiddleware
from app.routers import auth, gyms, members, payments, dashboard, notifications, attendance, assets, onboarding, billing

# Configure structured logging BEFORE anything else
setup_logging()
logger = logging.getLogger("gymflow")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle. Validates config before accepting requests."""
    settings.validate_for_startup()
    logger.info(f"Starting {settings.APP_NAME} (env={settings.APP_ENV})")

    # Configure WhatsApp provider based on settings
    _setup_whatsapp_provider()

    # Configure payment provider
    _setup_payment_provider()

    # Start background scheduler (reminders, notification processing)
    start_scheduler()

    # Seed default subscription plans (idempotent)
    async with async_session_factory() as session:
        async with session.begin():
            from app.services.billing_service import seed_default_plans
            await seed_default_plans(session)

    yield

    stop_scheduler()
    logger.info(f"Shutting down {settings.APP_NAME}")


def _setup_whatsapp_provider() -> None:
    """Configure the WhatsApp provider from settings."""
    from app.services.whatsapp_provider import LogOnlyProvider, AiSensyProvider

    provider_name = settings.WHATSAPP_PROVIDER
    if provider_name == "aisensy" and settings.WHATSAPP_API_KEY:
        provider = AiSensyProvider(api_key=settings.WHATSAPP_API_KEY)
        logger.info("WhatsApp provider: AiSensy")
    else:
        provider = LogOnlyProvider()
        logger.info("WhatsApp provider: log_only (no messages will be sent)")
    configure_provider(provider)


def _setup_payment_provider() -> None:
    """Configure the payment gateway provider from settings."""
    from app.services.payment_gateway import (
        MockProvider,
        RazorpayProvider,
        configure_payment_provider,
    )

    if (
        settings.RAZORPAY_KEY_ID
        and settings.RAZORPAY_KEY_SECRET
        and settings.RAZORPAY_KEY_ID != "mock"
    ):
        provider = RazorpayProvider(
            key_id=settings.RAZORPAY_KEY_ID,
            key_secret=settings.RAZORPAY_KEY_SECRET,
            webhook_secret=settings.RAZORPAY_WEBHOOK_SECRET,
        )
        logger.info("Payment provider: Razorpay")
    else:
        provider = MockProvider()
        logger.info("Payment provider: Mock (no real payments)")
    configure_payment_provider(provider)


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# Domain exception → HTTP response mapping
app.add_exception_handler(GymFlowException, gymflow_exception_handler)

# Middleware stack (order matters — outermost first)
# 1. Request context — correlation IDs, timing, logging
app.add_middleware(RequestContextMiddleware)

# 2. Security headers — nosniff, frame protection, etc.
app.add_middleware(SecurityHeadersMiddleware)

# 3. Rate limiting — brute-force protection
app.add_middleware(RateLimitMiddleware)

# 4. CORS — must be AFTER request context (Starlette adds in reverse order)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# 5. Subscription enforcement — blocks writes for expired/locked gyms
app.add_middleware(SubscriptionEnforcementMiddleware)

# 6. Body size limit — reject oversized payloads (1 MB)
app.add_middleware(BodySizeLimitMiddleware)

# Routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(gyms.router, prefix="/api/v1/gyms", tags=["Gyms"])
app.include_router(members.router, prefix="/api/v1/members", tags=["Members"])
app.include_router(payments.router, prefix="/api/v1/payments", tags=["Payments"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])
app.include_router(attendance.router, prefix="/api/v1/attendance", tags=["Attendance"])
app.include_router(assets.router, prefix="/api/v1/assets", tags=["Equipment"])
app.include_router(onboarding.router, prefix="/api/v1", tags=["Onboarding"])
app.include_router(billing.router, prefix="/api/v1/billing", tags=["Billing"])


@app.get("/health")
async def health_check():
    """
    Combined health check — verifies DB connectivity.
    Used by Docker healthcheck, load balancers, and monitoring.
    Backwards compatible with existing monitoring.
    """
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "service": settings.APP_NAME,
            "environment": settings.APP_ENV,
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "detail": "Database unreachable"},
        )


@app.get("/health/live")
async def liveness():
    """
    Liveness probe — is the process alive?

    Always returns 200 if the process is running.
    Used by Docker/platform to restart crashed containers.
    Should NOT check external dependencies (DB, Redis, etc.)
    """
    return {"status": "alive"}


@app.get("/health/ready")
async def readiness():
    """
    Readiness probe — is the service ready to handle requests?

    Checks:
    1. Database connectivity (can we query?)
    2. Scheduler running (are background jobs active?)

    Used by load balancers to route traffic only to healthy instances.
    Returns 503 if not ready — platform stops sending traffic but
    doesn't restart the container.
    """
    checks: dict[str, str] = {}

    # DB check
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "unreachable"

    # Scheduler check
    from app.core.scheduler import scheduler, get_job_health
    checks["scheduler"] = "running" if scheduler.running else "stopped"

    # Job health — report if any jobs have consecutive failures
    job_failures = get_job_health()
    failing_jobs = {k: v for k, v in job_failures.items() if v >= 3}
    if failing_jobs:
        checks["failing_jobs"] = str(failing_jobs)

    all_ok = all(v in ("ok", "running") for v in checks.values())

    if not all_ok:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "checks": checks},
        )

    return {"status": "ready", "checks": checks}
