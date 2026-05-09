"""
Structured logging configuration for GymFlow.

Strategy:
- Development: Human-readable format with colors (easy terminal debugging)
- Staging/Production: JSON format (machine-parseable for log aggregation)
- Request IDs: Set via contextvars in middleware, attached to every log line
- Tenant context: gym_id attached when available (multi-tenant log filtering)

Why structured logging matters for SaaS:
- Filter by gym_id when a customer reports an issue
- Correlate all logs from a single request via request_id
- Parse and aggregate with Railway/Render/Betterstack/Grafana Loki
- Sanitize sensitive data before it reaches log storage

Sensitive data that MUST NOT be logged:
- Passwords (plaintext or hashed)
- JWT tokens (access or refresh)
- API keys (WhatsApp, etc.)
"""

import json
import logging
import sys
from contextvars import ContextVar
from typing import Any

from app.core.config import settings

# Context variables set by request middleware
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
gym_id_var: ContextVar[str] = ContextVar("gym_id", default="-")


class JSONFormatter(logging.Formatter):
    """
    JSON log formatter for production environments.

    Output format:
    {"timestamp": "...", "level": "INFO", "logger": "gymflow", "message": "...",
     "request_id": "abc123", "gym_id": "uuid", ...}

    Machine-parseable by any log aggregation tool.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_data: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_var.get("-"),
            "gym_id": gym_id_var.get("-"),
        }

        if record.exc_info and record.exc_info[1]:
            log_data["exception"] = self.formatException(record.exc_info)

        # Merge any extra fields passed via logger.info("msg", extra={...})
        for key in ("method", "path", "status_code", "duration_ms", "client_ip",
                     "user_id", "detail"):
            if hasattr(record, key):
                log_data[key] = getattr(record, key)

        return json.dumps(log_data, default=str)


class DevFormatter(logging.Formatter):
    """
    Human-readable log formatter for local development.

    Format: TIMESTAMP | LEVEL | LOGGER | [request_id] [gym_id] | MESSAGE
    """

    def format(self, record: logging.LogRecord) -> str:
        req_id = request_id_var.get("-")
        gid = gym_id_var.get("-")
        base = super().format(record)
        return f"{base} | req={req_id} gym={gid}"


def setup_logging() -> None:
    """
    Configure logging for the entire application.
    Called once during app startup (before lifespan).

    Rules:
    - Production/staging: JSON to stdout (platform captures stdout)
    - Development: Human-readable with timestamps
    - Log level: Driven by LOG_LEVEL setting
    - Third-party loggers: Quieted to WARNING to reduce noise
    """
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    # Root logger
    root = logging.getLogger()
    root.setLevel(log_level)

    # Remove any existing handlers (avoid duplicates on reload)
    root.handlers.clear()

    # Stdout handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)

    if settings.is_development:
        formatter = DevFormatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    else:
        formatter = JSONFormatter(datefmt="%Y-%m-%dT%H:%M:%S")

    handler.setFormatter(formatter)
    root.addHandler(handler)

    # Quiet noisy third-party loggers
    for noisy in ("uvicorn.access", "sqlalchemy.engine", "apscheduler",
                   "httpx", "httpcore", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    # Keep uvicorn error logger visible
    logging.getLogger("uvicorn.error").setLevel(log_level)


# Sanitization helpers
_SENSITIVE_KEYS = {"password", "password_hash", "token", "access_token",
                   "refresh_token", "api_key", "secret", "authorization"}


def sanitize_dict(data: dict[str, Any]) -> dict[str, Any]:
    """
    Redact sensitive fields from a dictionary before logging.
    Used for request/response body logging in debug mode.
    Recursively handles nested dicts and lists.
    """
    sanitized = {}
    for key, value in data.items():
        if key.lower() in _SENSITIVE_KEYS:
            sanitized[key] = "***REDACTED***"
        elif isinstance(value, dict):
            sanitized[key] = sanitize_dict(value)
        elif isinstance(value, list):
            sanitized[key] = [
                sanitize_dict(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            sanitized[key] = value
    return sanitized
