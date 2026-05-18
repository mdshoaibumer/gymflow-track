"""
Rotating QR code generation for gym-displayed attendance.

Security Design:
- QR codes rotate every 30 seconds (configurable via ROTATION_INTERVAL_SECONDS)
- Codes are HMAC-SHA256 signed: gym_id + time_slot → 6-char alphanumeric code
- Validation window of ±2 minutes allows for slow WhatsApp sends
- Code is short enough to embed in a WhatsApp deeplink URL

Operational Flow:
1. Gym displays a rotating QR on a TV/tablet at the entrance
2. QR content = WhatsApp deeplink: wa.me/{gym_phone}?text=CHECKIN {code}
3. Member scans → WhatsApp opens with pre-filled message → taps Send
4. Backend webhook receives message, validates code, marks attendance
5. Bot replies with confirmation

Why rotating codes:
- Static QR could be photographed and shared (fake attendance from home)
- 30-second rotation + 2-minute validity = practical for in-person scanning
- Even if someone screenshots, it expires within 2 minutes
"""

import hashlib
import hmac
import time

from uuid import UUID

from app.core.config import settings

# Rotation interval in seconds — how often the QR code changes
ROTATION_INTERVAL_SECONDS = 30

# How many intervals before/after current to accept (±2 minutes = ±4 intervals)
VALIDITY_WINDOW = 4

# Domain separation from the member QR signing key
_GYM_QR_KEY_PREFIX = b"gymflow-gym-qr-v1:"


def _get_signing_key() -> bytes:
    """Derive gym QR signing key from the app's JWT secret."""
    return _GYM_QR_KEY_PREFIX + settings.JWT_SECRET_KEY.encode()


def _get_time_slot(timestamp: float | None = None) -> int:
    """Get the current time slot (epoch seconds divided by rotation interval)."""
    ts = timestamp if timestamp is not None else time.time()
    return int(ts) // ROTATION_INTERVAL_SECONDS


def _compute_code(gym_id: UUID, time_slot: int) -> str:
    """
    Compute a 6-character alphanumeric attendance code for a gym + time slot.

    Uses HMAC-SHA256, then takes first 4 bytes → base36 encoding → 6 chars.
    """
    message = f"{gym_id}|{time_slot}".encode()
    sig = hmac.HMAC(_get_signing_key(), message, hashlib.sha256).digest()
    # Convert first 4 bytes to an integer, then to base-36 (0-9, A-Z)
    num = int.from_bytes(sig[:4], "big")
    # Base-36 encode to get alphanumeric, take 6 chars, uppercase
    code = _base36_encode(num).upper().zfill(6)[:6]
    return code


def _base36_encode(number: int) -> str:
    """Encode an integer to base-36 (0-9, a-z)."""
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    if number == 0:
        return "0"
    result = []
    while number > 0:
        result.append(chars[number % 36])
        number //= 36
    return "".join(reversed(result))


def generate_gym_code(gym_id: UUID) -> str:
    """
    Generate the current rotating attendance code for a gym.

    This code should be displayed on the gym's screen and refreshed
    every ROTATION_INTERVAL_SECONDS.

    Returns:
        6-character alphanumeric code (e.g., "A7X9K2")
    """
    time_slot = _get_time_slot()
    return _compute_code(gym_id, time_slot)


def generate_whatsapp_checkin_url(gym_phone: str, gym_id: UUID) -> str:
    """
    Generate the full WhatsApp deeplink URL for the current code.

    QR content displayed on the gym's TV/tablet.

    Args:
        gym_phone: Gym's WhatsApp number (E.164 without +, e.g., "919876543210")
        gym_id: The gym's UUID

    Returns:
        WhatsApp deeplink URL (e.g., "https://wa.me/919876543210?text=CHECKIN A7X9K2")
    """
    code = generate_gym_code(gym_id)
    # URL-encode the space in the message
    return f"https://wa.me/{gym_phone}?text=CHECKIN%20{code}"


def validate_gym_code(gym_id: UUID, code: str) -> bool:
    """
    Validate a gym attendance code.

    Checks the code against the current time slot and nearby slots
    (±VALIDITY_WINDOW intervals = ±2 minutes by default).

    Args:
        gym_id: The gym the code should belong to
        code: The 6-character code submitted by the member

    Returns:
        True if the code is valid (matches any slot within the window)
    """
    code = code.strip().upper()
    current_slot = _get_time_slot()

    # Check current slot and nearby slots (handles clock drift + sending delay)
    for offset in range(-VALIDITY_WINDOW, VALIDITY_WINDOW + 1):
        expected = _compute_code(gym_id, current_slot + offset)
        if hmac.compare_digest(code, expected):
            return True

    return False


def get_code_ttl_seconds() -> int:
    """
    Get the number of seconds until the current code expires.

    Used by the frontend to know when to refresh the QR.
    """
    now = time.time()
    current_slot_start = _get_time_slot(now) * ROTATION_INTERVAL_SECONDS
    next_slot_start = current_slot_start + ROTATION_INTERVAL_SECONDS
    return max(1, int(next_slot_start - now))
