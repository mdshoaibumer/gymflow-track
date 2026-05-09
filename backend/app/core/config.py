"""
Application configuration — single source of truth for all settings.

Environment strategy:
- development: Permissive defaults, debug on, insecure secrets allowed.
- staging: Production-like but with debug endpoints enabled.
- production: Strict validation, no insecure defaults, fail-fast on bad config.

Secrets strategy for SaaS:
- Local dev: `.env` file (gitignored)
- Railway/Render/Fly: Platform secrets (env vars injected at runtime)
- VPS: `.env` file on server or systemd environment directives
- No vault/config server needed at MVP scale

Settings are loaded ONCE at module import. The validate_for_startup() method
is called during lifespan startup — before any request is accepted.
"""

import logging
import sys
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # === App ===
    APP_NAME: str = "GymFlow"
    APP_ENV: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    # === Database ===
    DATABASE_URL: str = "postgresql+asyncpg://gymflow:gymflow@localhost:5432/gymflow"
    DATABASE_URL_SYNC: str = "postgresql://gymflow:gymflow@localhost:5432/gymflow"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30

    # === JWT ===
    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # === CORS ===
    CORS_ORIGINS: str = "http://localhost:3000"

    # === Rate Limiting ===
    RATE_LIMIT_AUTH: int = 10  # login/register attempts per minute per IP
    RATE_LIMIT_API: int = 100  # general API requests per minute per IP

    # === Proxy ===
    TRUST_PROXY_HEADERS: bool = False  # Only enable in production behind reverse proxy

    # === WhatsApp ===
    WHATSAPP_PROVIDER: str = "log_only"  # "log_only" | "aisensy"
    WHATSAPP_API_KEY: str = ""

    # === Password Policy ===
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_MAX_LENGTH: int = 128

    # === Razorpay (Payment Gateway) ===
    RAZORPAY_KEY_ID: str = "mock"           # "mock" = use MockProvider (dev/test)
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    # === Billing ===
    TRIAL_DAYS: int = 14

    @field_validator("APP_ENV", mode="before")
    @classmethod
    def _normalize_env(cls, v: str) -> str:
        return v.lower().strip()

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"

    def validate_for_startup(self) -> None:
        """
        Validate critical configuration at startup.
        Fails fast with a clear error rather than crashing mid-request.

        Validation tiers:
        - production: Strict — no insecure defaults, no debug mode
        - staging: Moderate — warn on insecure secrets but allow boot
        - development: Permissive — anything goes
        """
        errors: list[str] = []
        warnings: list[str] = []

        insecure_secrets = {"change-me", "dev-secret-key-change-in-production", ""}

        # --- JWT validation ---
        if self.APP_ENV in ("production", "staging"):
            if self.JWT_SECRET_KEY in insecure_secrets:
                msg = (
                    "JWT_SECRET_KEY is insecure. Set a random 64+ char secret. "
                    'Generate: python -c "import secrets; print(secrets.token_hex(32))"'
                )
                if self.is_production:
                    errors.append(msg)
                else:
                    warnings.append(msg)

            if self.JWT_SECRET_KEY and len(self.JWT_SECRET_KEY) < 32:
                msg = "JWT_SECRET_KEY too short. Use at least 32 characters for HS256."
                if self.is_production:
                    errors.append(msg)
                else:
                    warnings.append(msg)

        # --- Debug mode ---
        if self.is_production and self.DEBUG:
            errors.append("DEBUG=true is not allowed in production.")

        # --- Database URL ---
        if self.is_production and "localhost" in self.DATABASE_URL:
            warnings.append("DATABASE_URL points to localhost in production — is this intentional?")

        # --- CORS ---
        if self.is_production and "localhost" in self.CORS_ORIGINS:
            warnings.append("CORS_ORIGINS includes localhost in production.")

        # --- Payment provider ---
        if self.is_production and self.RAZORPAY_KEY_ID in ("mock", ""):
            errors.append(
                "RAZORPAY_KEY_ID must be set in production (not 'mock'). "
                "Configure Razorpay credentials for real payment processing."
            )
        if self.is_production and not self.RAZORPAY_WEBHOOK_SECRET:
            warnings.append("RAZORPAY_WEBHOOK_SECRET not set — webhook verification will fail.")

        # --- Emit warnings ---
        for w in warnings:
            logging.warning(f"CONFIG WARNING: {w}")

        # --- Fail on errors ---
        if errors:
            for err in errors:
                logging.error(f"CONFIG ERROR: {err}")
            logging.error(
                "Startup aborted due to configuration errors. "
                "Fix the above issues or set APP_ENV=development to bypass."
            )
            sys.exit(1)

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

