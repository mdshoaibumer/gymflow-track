"""
Attendance service — business rules for check-in/check-out workflows.

Business Rules:
1. Only ACTIVE membership members can check in
2. One check-in per member per calendar day (dedup)
3. QR tokens are validated via HMAC (no plain IDs)
4. Cross-gym QR codes are rejected (gym_id in token)
5. Check-out is optional (many small gyms don't track departure)
6. Staff can cancel erroneous check-ins
7. Manual check-in requires staff authentication

Edge Cases Handled:
- Member scans QR but membership expired yesterday → rejected with clear message
- Member scans twice in same day → returns existing attendance (no error, no duplicate)
- Staff manually checks in member who already scanned → same dedup behavior
- QR from another gym → rejected (HMAC validation includes gym_id)
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.timezone import today_ist
from app.models.attendance import Attendance, AttendanceStatus, CheckInSource
from app.models.member import MembershipStatus
from app.repositories.attendance_repository import AttendanceRepository
from app.repositories.member_repository import MemberRepository
from app.services.qr_service import validate_qr_token

logger = logging.getLogger("gymflow.attendance")


class AttendanceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.attendance_repo = AttendanceRepository(db)
        self.member_repo = MemberRepository(db)

    async def check_in_by_qr(
        self, gym_id: UUID, qr_token: str, recorded_by: UUID | None = None
    ) -> Attendance:
        """
        Process a QR-based check-in.

        Flow:
        1. Validate QR token (HMAC check)
        2. Verify gym_id matches (prevents cross-gym misuse)
        3. Verify member exists and has active membership
        4. Check for duplicate (same day) → return existing if found
        5. Create attendance record

        Returns:
            Attendance record (new or existing for today)

        Raises:
            ValidationError: If QR is invalid, membership expired, or cross-gym
        """
        # 1. Validate QR token
        result = validate_qr_token(qr_token)
        if result is None:
            raise ValidationError("Invalid QR code")

        token_gym_id, member_id = result

        # 2. Cross-gym check
        if token_gym_id != gym_id:
            logger.warning(
                f"Cross-gym QR attempt: token_gym={token_gym_id}, request_gym={gym_id}"
            )
            raise ValidationError("This QR code belongs to a different gym")

        # 3-5. Delegate to common check-in logic
        return await self._perform_check_in(
            gym_id=gym_id,
            member_id=member_id,
            source=CheckInSource.QR,
            recorded_by=recorded_by,
        )

    async def check_in_manual(
        self, gym_id: UUID, member_id: UUID, recorded_by: UUID
    ) -> Attendance:
        """
        Manual check-in by staff (no QR needed).

        Used when:
        - Member forgot their QR card
        - Reception desk check-in
        - Staff assisting a member

        Same business rules apply (active membership, no duplicates).
        """
        return await self._perform_check_in(
            gym_id=gym_id,
            member_id=member_id,
            source=CheckInSource.MANUAL,
            recorded_by=recorded_by,
        )

    async def check_in_self_service(
        self, gym_id: UUID, identifier: str
    ) -> Attendance:
        """
        Self-service check-in via QR scan → web page.

        The member scans the gym's QR code which opens a web page.
        They enter their name, phone, or email to identify themselves.

        Flow:
        1. Look up member by identifier (phone/email/name)
        2. Verify active membership
        3. Dedup check
        4. Create attendance record

        Raises:
            NotFoundError: If no member matches the identifier
            ValidationError: If membership is not active
        """
        member = await self.member_repo.find_by_identifier(identifier, gym_id)
        if not member:
            raise NotFoundError(
                "No member found with that name, phone, or email. "
                "Please check and try again."
            )

        return await self._perform_check_in(
            gym_id=gym_id,
            member_id=member.id,
            source=CheckInSource.SELF_SERVICE,
            recorded_by=None,
        )

    async def check_out(
        self, gym_id: UUID, attendance_id: UUID
    ) -> Attendance:
        """
        Record a check-out for an existing attendance record.

        Check-out is optional — many small gyms don't track departure.
        Only CHECKED_IN records can be checked out.
        """
        attendance = await self.attendance_repo.get_by_id(attendance_id, gym_id)
        if not attendance:
            raise NotFoundError("Attendance record not found")

        if attendance.status != AttendanceStatus.CHECKED_IN:
            raise ValidationError("Cannot check out — member is not checked in")

        now = datetime.now(timezone.utc)
        return await self.attendance_repo.mark_checked_out(attendance, now)

    async def cancel_attendance(
        self, gym_id: UUID, attendance_id: UUID
    ) -> Attendance:
        """
        Cancel an erroneous attendance record. Staff/admin operation.
        Does not hard-delete — marks as cancelled for audit trail.
        """
        attendance = await self.attendance_repo.get_by_id(attendance_id, gym_id)
        if not attendance:
            raise NotFoundError("Attendance record not found")

        if attendance.status == AttendanceStatus.CANCELLED:
            raise ValidationError("Already cancelled")

        return await self.attendance_repo.mark_cancelled(attendance)

    async def _perform_check_in(
        self,
        gym_id: UUID,
        member_id: UUID,
        source: CheckInSource,
        recorded_by: UUID | None,
    ) -> Attendance:
        """
        Core check-in logic shared by QR and manual flows.

        Business rules enforced:
        1. Member must exist in this gym
        2. Membership must be ACTIVE
        3. No duplicate check-in for today
        """
        # 1. Verify member exists in this gym
        member = await self.member_repo.get_by_id(member_id, gym_id)
        if not member:
            raise NotFoundError("Member not found")

        # 2. Verify active membership
        if member.membership_status != MembershipStatus.ACTIVE:
            status_messages = {
                MembershipStatus.EXPIRED: "Membership has expired — please renew",
                MembershipStatus.FROZEN: "Membership is frozen",
                MembershipStatus.PENDING: "Membership is pending activation",
                MembershipStatus.CANCELLED: "Membership has been cancelled",
            }
            msg = status_messages.get(
                member.membership_status, "Membership is not active"
            )
            raise ValidationError(msg)

        # 3. Check for duplicate today
        today = today_ist()
        existing = await self.attendance_repo.get_today_for_member(
            gym_id, member_id, today
        )
        if existing:
            # Not an error — just return existing record (idempotent)
            logger.debug(f"Duplicate check-in for member {member_id}, returning existing")
            existing.member = member
            return existing

        # 4. Create attendance record
        now = datetime.now(timezone.utc)
        attendance = Attendance(
            gym_id=gym_id,
            member_id=member_id,
            check_in_at=now,
            check_in_date=today,
            status=AttendanceStatus.CHECKED_IN,
            source=source,
            recorded_by=recorded_by,
        )
        try:
            # Use a SAVEPOINT so that an IntegrityError from a concurrent
            # insert only rolls back this INSERT, not the outer transaction.
            async with self.db.begin_nested():
                created = await self.attendance_repo.create(attendance)
            # Attach the already-fetched member so the router can build
            # the response without a lazy-load (relationship is lazy="raise").
            created.member = member
            return created
        except IntegrityError:
            # Race condition: concurrent request already inserted a row.
            # The SAVEPOINT was rolled back — outer session is still usable.
            existing = await self.attendance_repo.get_today_for_member(
                gym_id, member_id, today
            )
            if existing:
                logger.debug(f"Concurrent check-in race for member {member_id}, returning existing")
                existing.member = member
                return existing
            # Should not happen — re-raise if no existing record found
            raise

    async def generate_member_qr(self, gym_id: UUID, member_id: UUID) -> str:
        """
        Generate a QR token for a member.
        Verifies member exists in the gym before generating.

        Returns:
            QR token string (to be encoded into a QR image on the frontend)
        """
        from app.services.qr_service import generate_qr_token

        member = await self.member_repo.get_by_id(member_id, gym_id)
        if not member:
            raise NotFoundError("Member not found")

        return generate_qr_token(gym_id, member_id)
