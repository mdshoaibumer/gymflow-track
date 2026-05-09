"""
Shared validation helpers for Pydantic schemas.

Centralized here to avoid duplication across auth and user schemas.
"""

import re

from app.core.config import settings


def validate_password_strength(password: str) -> str:
    """
    Enforce password policy. Rules:
    - Length: configurable min/max (default 8-128)
    - Must contain: 1 uppercase, 1 lowercase, 1 digit
    - No specific special char requirement (reduces user friction)

    Why these rules:
    - Prevents trivially weak passwords (e.g., "password", "12345678")
    - Uppercase+lowercase+digit covers NIST "moderate" complexity
    - No special char requirement: NIST 800-63B recommends length over complexity
    - Max 128 chars: prevents bcrypt DoS (bcrypt truncates at 72 bytes anyway)
    """
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters")
    if len(password) > settings.PASSWORD_MAX_LENGTH:
        raise ValueError(f"Password must be at most {settings.PASSWORD_MAX_LENGTH} characters")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one digit")
    return password
