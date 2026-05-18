"""
WhatsApp attendance webhook handler.

Processes incoming WhatsApp messages for attendance check-in.
When a member sends "CHECKIN {code}" to the gym's WhatsApp number,
this service validates the code and marks attendance.

Flow:
1. WhatsApp webhook delivers incoming message
2. Parse message for "CHECKIN {code}" pattern
3. Look up gym by the WhatsApp number that received the message
4. Look up member by sender's phone number
5. Validate the rotating code (proves physical presence)
6. Mark attendance
7. Send confirmation reply via WhatsApp

Security:
- Rotating code prevents remote check-in (screenshot expires in 2 min)
- Phone number identity from WhatsApp (can't be spoofed via API)
- Member must exist in the gym's roster with an active membership
"""

import logging
import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import Attendance, AttendanceStatus, CheckInSource
from app.models.gym import Gym
from app.models.member import Member, MembershipStatus
from app.repositories.attendance_repository import AttendanceRepository
from app.repositories.member_repository import MemberRepository
from app.services.gym_qr_service import validate_gym_code

logger = logging.getLogger("gymflow.whatsapp_attendance")

# Pattern to match "CHECKIN XXXXXX" (case-insensitive)
CHECKIN_PATTERN = re.compile(r"^\s*CHECKIN\s+([A-Z0-9]{4,8})\s*$", re.IGNORECASE)


class WhatsAppAttendanceResult:
    """Result of processing a WhatsApp attendance message."""

    def __init__(
        self,
        success: bool,
        message: str,
        member_name: str | None = None,
        attendance: Attendance | None = None,
    ):
        self.success = success
        self.message = message
        self.member_name = member_name
        self.attendance = attendance


async def process_attendance_message(
    db: AsyncSession,
    sender_phone: str,
    message_body: str,
    receiver_phone: str,
) -> WhatsAppAttendanceResult | None:
    """
    Process an incoming WhatsApp message for attendance.

    Args:
        db: Database session
        sender_phone: Member's WhatsApp number (E.164, e.g., "919876543210")
        message_body: The message text sent by the member
        receiver_phone: The gym's WhatsApp number that received the message

    Returns:
        WhatsAppAttendanceResult if message was a check-in attempt, None if not a check-in message.
    """
    # 1. Check if this message matches the check-in pattern
    match = CHECKIN_PATTERN.match(message_body.strip())
    if not match:
        return None  # Not a check-in message, ignore

    code = match.group(1).upper()
    logger.info(f"Attendance check-in attempt from {sender_phone} with code {code}")

    # 2. Find the gym by the receiving WhatsApp number
    gym = await _find_gym_by_phone(db, receiver_phone)
    if not gym:
        logger.warning(f"No gym found for WhatsApp number {receiver_phone}")
        return WhatsAppAttendanceResult(
            success=False,
            message="Sorry, this number is not linked to any gym. Please contact your gym owner.",
        )

    # 3. Validate the rotating code
    if not validate_gym_code(gym.id, code):
        logger.warning(f"Invalid/expired code {code} for gym {gym.id} from {sender_phone}")
        return WhatsAppAttendanceResult(
            success=False,
            message="Invalid or expired code. Please scan the QR code displayed at the gym entrance again.",
        )

    # 4. Find the member by phone number
    member_repo = MemberRepository(db)
    # Normalize phone — try with and without country code prefix
    member = await _find_member_by_phone(member_repo, sender_phone, gym.id)
    if not member:
        logger.warning(f"No member found for phone {sender_phone} in gym {gym.id}")
        return WhatsAppAttendanceResult(
            success=False,
            message="Your phone number is not registered at this gym. Please contact your gym owner.",
        )

    # 5. Check membership status
    if member.membership_status != MembershipStatus.ACTIVE:
        status_messages = {
            MembershipStatus.EXPIRED: "Your membership has expired. Please renew to mark attendance.",
            MembershipStatus.FROZEN: "Your membership is frozen. Please contact your gym owner.",
            MembershipStatus.PENDING: "Your membership is pending activation.",
            MembershipStatus.CANCELLED: "Your membership has been cancelled.",
        }
        msg = status_messages.get(
            member.membership_status, "Your membership is not active."
        )
        return WhatsAppAttendanceResult(
            success=False,
            message=msg,
            member_name=member.name,
        )

    # 6. Check for duplicate (same day)
    from app.core.timezone import today_ist
    from datetime import datetime, timezone

    today = today_ist()
    attendance_repo = AttendanceRepository(db)
    existing = await attendance_repo.get_today_for_member(gym.id, member.id, today)
    if existing:
        logger.debug(f"Duplicate WhatsApp check-in for member {member.id}")
        return WhatsAppAttendanceResult(
            success=True,
            message=f"Hi {member.name}! You've already checked in today. Have a great workout! 💪",
            member_name=member.name,
            attendance=existing,
        )

    # 7. Create attendance record
    from sqlalchemy.exc import IntegrityError

    now = datetime.now(timezone.utc)
    attendance = Attendance(
        gym_id=gym.id,
        member_id=member.id,
        check_in_at=now,
        check_in_date=today,
        status=AttendanceStatus.CHECKED_IN,
        source=CheckInSource.WHATSAPP_QR,
        recorded_by=None,  # Self-service, no staff involved
    )

    try:
        async with db.begin_nested():
            db.add(attendance)
            await db.flush()
        logger.info(f"WhatsApp attendance recorded: member={member.id}, gym={gym.id}")
        return WhatsAppAttendanceResult(
            success=True,
            message=f"✅ Welcome, {member.name}! Attendance marked for today. Have a great workout! 💪",
            member_name=member.name,
            attendance=attendance,
        )
    except IntegrityError:
        # Race condition — concurrent check-in
        existing = await attendance_repo.get_today_for_member(gym.id, member.id, today)
        if existing:
            return WhatsAppAttendanceResult(
                success=True,
                message=f"Hi {member.name}! You've already checked in today. Have a great workout! 💪",
                member_name=member.name,
                attendance=existing,
            )
        raise


async def _find_gym_by_phone(db: AsyncSession, phone: str) -> Gym | None:
    """
    Find a gym by its phone number.

    Tries multiple phone formats (with/without country code, with/without leading 0).
    Uses .first() because gym phone is not unique-constrained.
    """
    # Normalize: remove +, spaces, dashes
    normalized = phone.strip().replace("+", "").replace(" ", "").replace("-", "")

    # Try exact match first
    result = await db.execute(select(Gym).where(Gym.phone == normalized, Gym.is_active == True))  # noqa: E712
    gym = result.scalars().first()
    if gym:
        return gym

    # Try with + prefix
    result = await db.execute(select(Gym).where(Gym.phone == f"+{normalized}", Gym.is_active == True))  # noqa: E712
    gym = result.scalars().first()
    if gym:
        return gym

    # Try without country code (assume India +91)
    if normalized.startswith("91") and len(normalized) > 10:
        local = normalized[2:]
        result = await db.execute(select(Gym).where(Gym.phone == local, Gym.is_active == True))  # noqa: E712
        gym = result.scalars().first()
        if gym:
            return gym

    return None


async def _find_member_by_phone(
    member_repo: MemberRepository, phone: str, gym_id: UUID
) -> Member | None:
    """
    Find a member by phone number, trying various format normalization.

    WhatsApp sends numbers in E.164 (e.g., "919876543210").
    Members might be stored as "9876543210" or "+919876543210" or "919876543210".
    """
    # Normalize: remove +, spaces, dashes
    normalized = phone.strip().replace("+", "").replace(" ", "").replace("-", "")

    # Try exact match
    member = await member_repo.get_by_phone_and_gym(normalized, gym_id)
    if member:
        return member

    # Try with + prefix
    member = await member_repo.get_by_phone_and_gym(f"+{normalized}", gym_id)
    if member:
        return member

    # Try without country code (91 for India)
    if normalized.startswith("91") and len(normalized) > 10:
        local = normalized[2:]
        member = await member_repo.get_by_phone_and_gym(local, gym_id)
        if member:
            return member

    # Try with country code added (if stored as 10-digit)
    if len(normalized) == 10:
        member = await member_repo.get_by_phone_and_gym(f"91{normalized}", gym_id)
        if member:
            return member
        member = await member_repo.get_by_phone_and_gym(f"+91{normalized}", gym_id)
        if member:
            return member

    return None
