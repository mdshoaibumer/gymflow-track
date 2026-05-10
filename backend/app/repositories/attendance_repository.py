from datetime import date, datetime
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.attendance import Attendance, AttendanceStatus, CheckInSource


class AttendanceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, attendance: Attendance) -> Attendance:
        self.db.add(attendance)
        await self.db.flush()
        return attendance

    async def get_by_id(self, attendance_id: UUID, gym_id: UUID) -> Attendance | None:
        result = await self.db.execute(
            select(Attendance).where(
                Attendance.id == attendance_id,
                Attendance.gym_id == gym_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_today_for_member(
        self, gym_id: UUID, member_id: UUID, today: date
    ) -> Attendance | None:
        """Check if member already checked in today (dedup check)."""
        result = await self.db.execute(
            select(Attendance).where(
                Attendance.gym_id == gym_id,
                Attendance.member_id == member_id,
                Attendance.check_in_date == today,
                Attendance.status != AttendanceStatus.CANCELLED,
            )
        )
        return result.scalar_one_or_none()

    async def list_today(
        self, gym_id: UUID, today: date, skip: int = 0, limit: int = 100
    ) -> list[Attendance]:
        """Get today's attendance for a gym — reception desk view."""
        result = await self.db.execute(
            select(Attendance)
            .options(selectinload(Attendance.member))
            .where(
                Attendance.gym_id == gym_id,
                Attendance.check_in_date == today,
                Attendance.status != AttendanceStatus.CANCELLED,
            )
            .order_by(Attendance.check_in_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().unique().all())

    async def count_today(self, gym_id: UUID, today: date) -> int:
        """Count today's check-ins for a gym."""
        result = await self.db.execute(
            select(func.count())
            .select_from(Attendance)
            .where(
                Attendance.gym_id == gym_id,
                Attendance.check_in_date == today,
                Attendance.status != AttendanceStatus.CANCELLED,
            )
        )
        return result.scalar_one()

    async def count_currently_in(self, gym_id: UUID, today: date) -> int:
        """Count members currently in the gym (checked in, not yet checked out)."""
        result = await self.db.execute(
            select(func.count())
            .select_from(Attendance)
            .where(
                Attendance.gym_id == gym_id,
                Attendance.check_in_date == today,
                Attendance.status == AttendanceStatus.CHECKED_IN,
            )
        )
        return result.scalar_one()

    async def list_member_history(
        self,
        gym_id: UUID,
        member_id: UUID,
        skip: int = 0,
        limit: int = 30,
    ) -> list[Attendance]:
        """Get attendance history for a specific member."""
        result = await self.db.execute(
            select(Attendance)
            .where(
                Attendance.gym_id == gym_id,
                Attendance.member_id == member_id,
                Attendance.status != AttendanceStatus.CANCELLED,
            )
            .order_by(Attendance.check_in_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_member_attendance(
        self, gym_id: UUID, member_id: UUID
    ) -> int:
        """Count total attendance for a member."""
        result = await self.db.execute(
            select(func.count())
            .select_from(Attendance)
            .where(
                Attendance.gym_id == gym_id,
                Attendance.member_id == member_id,
                Attendance.status != AttendanceStatus.CANCELLED,
            )
        )
        return result.scalar_one()

    async def list_history(
        self,
        gym_id: UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[Attendance]:
        """Get attendance history for a gym, optionally filtered by date range."""
        query = (
            select(Attendance)
            .options(selectinload(Attendance.member))
            .where(
                Attendance.gym_id == gym_id,
                Attendance.status != AttendanceStatus.CANCELLED,
            )
        )
        if start_date:
            query = query.where(Attendance.check_in_date >= start_date)
        if end_date:
            query = query.where(Attendance.check_in_date <= end_date)

        result = await self.db.execute(
            query.order_by(Attendance.check_in_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().unique().all())

    async def count_history(
        self,
        gym_id: UUID,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> int:
        """Count attendance records for a gym within date range."""
        query = (
            select(func.count())
            .select_from(Attendance)
            .where(
                Attendance.gym_id == gym_id,
                Attendance.status != AttendanceStatus.CANCELLED,
            )
        )
        if start_date:
            query = query.where(Attendance.check_in_date >= start_date)
        if end_date:
            query = query.where(Attendance.check_in_date <= end_date)

        result = await self.db.execute(query)
        return result.scalar_one()

    async def get_recent_checkins(
        self, gym_id: UUID, limit: int = 5
    ) -> list[Attendance]:
        """Get most recent check-ins (for dashboard widget)."""
        result = await self.db.execute(
            select(Attendance)
            .options(selectinload(Attendance.member))
            .where(
                Attendance.gym_id == gym_id,
                Attendance.status != AttendanceStatus.CANCELLED,
            )
            .order_by(Attendance.check_in_at.desc())
            .limit(limit)
        )
        return list(result.scalars().unique().all())

    async def mark_checked_out(
        self, attendance: Attendance, check_out_at: datetime
    ) -> Attendance:
        attendance.status = AttendanceStatus.CHECKED_OUT
        attendance.check_out_at = check_out_at
        await self.db.flush()
        return attendance

    async def mark_cancelled(self, attendance: Attendance) -> Attendance:
        attendance.status = AttendanceStatus.CANCELLED
        await self.db.flush()
        return attendance

    async def count_by_date_range(
        self, gym_id: UUID, start_date: date, end_date: date
    ) -> list[tuple[date, int]]:
        """Get daily attendance counts for a date range (trend data)."""
        result = await self.db.execute(
            select(
                Attendance.check_in_date,
                func.count().label("count"),
            )
            .where(
                Attendance.gym_id == gym_id,
                Attendance.check_in_date >= start_date,
                Attendance.check_in_date <= end_date,
                Attendance.status != AttendanceStatus.CANCELLED,
            )
            .group_by(Attendance.check_in_date)
            .order_by(Attendance.check_in_date.asc())
        )
        return list(result.all())
