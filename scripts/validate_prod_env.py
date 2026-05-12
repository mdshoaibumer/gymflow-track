#!/usr/bin/env python3
"""
GymFlow Track — Production Environment Validator

Run before deployment to catch misconfigurations early.

Usage:
    python3 scripts/validate_prod_env.py
    python3 scripts/validate_prod_env.py --env-file .env
"""

import os
import sys
import re
from pathlib import Path


def load_env_file(path: str) -> dict:
    """Load .env file into a dictionary."""
    env = {}
    p = Path(path)
    if not p.exists():
        return env
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


# Required variables with validation rules
REQUIRED_VARS = {
    "POSTGRES_PASSWORD": {
        "min_length": 16,
        "description": "Database password",
        "insecure_values": {"gymflow", "password", "postgres", "admin"},
    },
    "JWT_SECRET_KEY": {
        "min_length": 32,
        "description": "JWT signing secret",
        "insecure_values": {"change-me", "dev-secret-key-change-in-production", "secret"},
    },
    "REDIS_PASSWORD": {
        "min_length": 12,
        "description": "Redis AUTH password",
        "insecure_values": {"redis", "password"},
    },
    "RAZORPAY_KEY_ID": {
        "description": "Razorpay API key",
        "insecure_values": {"mock", ""},
        "pattern": r"^rzp_(live|test)_",
    },
    "RAZORPAY_KEY_SECRET": {
        "min_length": 10,
        "description": "Razorpay API secret",
    },
}

RECOMMENDED_VARS = {
    "SENTRY_DSN": "Error tracking (Sentry)",
    "BACKUP_ENCRYPTION_KEY": "Backup encryption key",
    "RAZORPAY_WEBHOOK_SECRET": "Payment webhook verification",
    "ACME_EMAIL": "Let's Encrypt certificate notifications",
    "GRAFANA_PASSWORD": "Grafana admin password",
}

EXPECTED_VALUES = {
    "APP_ENV": "production",
    "DEBUG": "false",
    "COOKIE_SECURE": "true",
}


def validate():
    """Run all validation checks."""
    # Load env file if specified
    env_file = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "--env-file" else ".env"
    file_env = load_env_file(env_file)

    # Merge: file env → os.environ (os.environ takes precedence)
    merged = {**file_env, **os.environ}

    errors = []
    warnings = []
    passed = []

    # Check required variables
    for var, rules in REQUIRED_VARS.items():
        value = merged.get(var, "")
        desc = rules.get("description", var)

        if not value:
            errors.append(f"{var}: MISSING — {desc}")
            continue

        # Check insecure values
        insecure = rules.get("insecure_values", set())
        if value.lower() in {v.lower() for v in insecure}:
            errors.append(f"{var}: INSECURE VALUE — do not use '{value}' in production")
            continue

        # Check minimum length
        min_len = rules.get("min_length", 0)
        if min_len and len(value) < min_len:
            errors.append(f"{var}: TOO SHORT ({len(value)} chars, need {min_len}+)")
            continue

        # Check pattern
        pattern = rules.get("pattern")
        if pattern and not re.match(pattern, value):
            errors.append(f"{var}: INVALID FORMAT — expected pattern: {pattern}")
            continue

        # Check for placeholder text
        if "CHANGE_ME" in value or "XXXXXXXX" in value:
            errors.append(f"{var}: Contains placeholder text — replace with real value")
            continue

        passed.append(f"{var}: OK")

    # Check expected values
    for var, expected in EXPECTED_VALUES.items():
        value = merged.get(var, "")
        if value.lower() != expected.lower():
            errors.append(f"{var}: Expected '{expected}', got '{value or '(not set)'}'")
        else:
            passed.append(f"{var}: OK ({value})")

    # Check recommended variables
    for var, desc in RECOMMENDED_VARS.items():
        value = merged.get(var, "")
        if not value:
            warnings.append(f"{var}: Not set — {desc}")
        elif "CHANGE_ME" in value:
            warnings.append(f"{var}: Contains placeholder — {desc}")
        else:
            passed.append(f"{var}: OK")

    # Print results
    print("=" * 50)
    print("GymFlow Track — Environment Validation")
    print("=" * 50)
    print()

    if passed:
        print(f"PASSED ({len(passed)}):")
        for p in passed:
            print(f"  ✓ {p}")
        print()

    if warnings:
        print(f"WARNINGS ({len(warnings)}):")
        for w in warnings:
            print(f"  ⚠ {w}")
        print()

    if errors:
        print(f"ERRORS ({len(errors)}):")
        for e in errors:
            print(f"  ✗ {e}")
        print()
        print("RESULT: FAIL — Fix errors before deploying to production.")
        print()
        print("Generate secrets:")
        print('  python3 -c "import secrets; print(secrets.token_hex(32))"')
        sys.exit(1)
    else:
        print("RESULT: PASS — Environment is configured for production.")
        sys.exit(0)


if __name__ == "__main__":
    validate()
    # For now, this is a skeleton for the CI/CD or deployment script
    validate_env()
