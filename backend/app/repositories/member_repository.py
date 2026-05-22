from uuid import UUID
from datetime import timedelta

from sqlalchemy import select, func, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.timezone import today_ist

from app.models.member import Member, MembershipStatus


class MemberRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, member: Member) -> Member:
        self.db.add(member)
        await self.db.flush()
        return member

    async def get_by_id(self, member_id: UUID, gym_id: UUID) -> Member | None:
        result = await self.db.execute(
            select(Member).where(
                Member.id == member_id,
                Member.gym_id == gym_id,
                Member.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_by_gym(
        self, gym_id: UUID, skip: int = 0, limit: int = 50,
        search: str | None = None, status: str | None = None, plan: str | None = None,
        batch: str | None = None,
    ) -> list[Member]:
        """
        List members with optional text search, status, plan, and batch filters.

        Search matches against name or phone using case-insensitive ILIKE.
        Every query is scoped to gym_id — this is the tenant isolation boundary.
        No query in this repository ever omits the gym_id filter.
        """
        query = select(Member).where(
            Member.gym_id == gym_id,
            Member.is_deleted == False,  # noqa: E712
        )

        if search:
            # Escape SQL ILIKE wildcards to prevent unintended pattern matching
            escaped = search.replace("%", "\\%").replace("_", "\\_")
            search_pattern = f"%{escaped}%"
            query = query.where(
                or_(
                    Member.name.ilike(search_pattern),
                    Member.phone.ilike(search_pattern),
                )
            )

        if status:
            query = query.where(Member.membership_status == status)

        if plan:
            query = query.where(Member.membership_plan == plan)

        if batch:
            query = query.where(Member.batch == batch)

        result = await self.db.execute(
            query.order_by(Member.created_at.desc()).offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def count_by_gym(
        self, gym_id: UUID, search: str | None = None,
        status: str | None = None, plan: str | None = None,
        batch: str | None = None,
    ) -> int:
        """Count members with optional search/status/plan/batch filters — for pagination metadata."""
        query = select(func.count()).select_from(Member).where(
            Member.gym_id == gym_id,
            Member.is_deleted == False,  # noqa: E712
        )

        if search:
            escaped = search.replace("%", "\\%").replace("_", "\\_")
            search_pattern = f"%{escaped}%"
            query = query.where(
                or_(
                    Member.name.ilike(search_pattern),
                    Member.phone.ilike(search_pattern),
                )
            )

        if status:
            query = query.where(Member.membership_status == status)

        if plan:
            query = query.where(Member.membership_plan == plan)

        if batch:
            query = query.where(Member.batch == batch)

        result = await self.db.execute(query)
        return result.scalar_one()

    async def update(self, member: Member) -> Member:
        await self.db.flush()
        return member

    async def bulk_update_status(
        self, gym_id: UUID, member_ids: list[UUID], new_status: MembershipStatus
    ) -> int:
        """Bulk update membership_status for multiple members. Returns rows affected."""
        stmt = (
            update(Member)
            .where(
                Member.gym_id == gym_id,
                Member.id.in_(member_ids),
                Member.is_deleted == False,  # noqa: E712
            )
            .values(membership_status=new_status)
        )
        result = await self.db.execute(stmt)
        await self.db.flush()
        return result.rowcount

    async def get_by_phone_and_gym(self, phone: str, gym_id: UUID) -> Member | None:
        result = await self.db.execute(
            select(Member).where(
                Member.phone == phone,
                Member.gym_id == gym_id,
                Member.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def find_by_identifier(self, identifier: str, gym_id: UUID) -> Member | None:
        """
        Find a member by name, phone, or email within a gym.

        Tries exact phone match first (most common), then email, then exact name.
        Phone matching includes normalized variants (with/without +91, leading 0).
        """
        identifier = identifier.strip()
        if not identifier:
            return None

        # Normalize phone: strip non-digits for phone matching
        digits_only = "".join(c for c in identifier if c.isdigit())

        # Try exact phone match first (most reliable)
        if digits_only and len(digits_only) >= 10:
            # Normalize to 10-digit Indian mobile
            phone_10 = digits_only
            if len(phone_10) == 12 and phone_10.startswith("91"):
                phone_10 = phone_10[2:]
            elif len(phone_10) == 11 and phone_10.startswith("0"):
                phone_10 = phone_10[1:]

            if len(phone_10) == 10:
                result = await self.db.execute(
                    select(Member).where(
                        Member.phone == phone_10,
                        Member.gym_id == gym_id,
                        Member.is_deleted == False,  # noqa: E712
                    )
                )
                member = result.scalar_one_or_none()
                if member:
                    return member

        # Try email match (case-insensitive)
        if "@" in identifier:
            result = await self.db.execute(
                select(Member).where(
                    Member.email.ilike(identifier),
                    Member.gym_id == gym_id,
                    Member.is_deleted == False,  # noqa: E712
                )
            )
            member = result.scalar_one_or_none()
            if member:
                return member

        # Try exact name match (case-insensitive)
        result = await self.db.execute(
            select(Member).where(
                Member.name.ilike(identifier),
                Member.gym_id == gym_id,
                Member.is_deleted == False,  # noqa: E712
            )
        )
        member = result.scalar_one_or_none()
        return member

    async def delete(self, member: Member) -> None:
        await self.db.delete(member)
        await self.db.flush()

    async def get_expiring_soon(self, gym_id: UUID, within_days: int = 7) -> list[Member]:
        """Members whose membership expires within N days (still ACTIVE)."""
        today = today_ist()
        end_date = today + timedelta(days=within_days)
        result = await self.db.execute(
            select(Member).where(
                Member.gym_id == gym_id,
                Member.is_deleted == False,  # noqa: E712
                Member.membership_status == MembershipStatus.ACTIVE,
                Member.membership_end.isnot(None),
                Member.membership_end >= today,
                Member.membership_end <= end_date,
            ).order_by(Member.membership_end.asc())
        )
        return list(result.scalars().all())

    async def count_expiring_soon(self, gym_id: UUID, within_days: int = 7) -> int:
        """Count members whose membership expires within N days (still ACTIVE)."""
        today = today_ist()
        end_date = today + timedelta(days=within_days)
        result = await self.db.execute(
            select(func.count()).select_from(Member).where(
                Member.gym_id == gym_id,
                Member.is_deleted == False,  # noqa: E712
                Member.membership_status == MembershipStatus.ACTIVE,
                Member.membership_end.isnot(None),
                Member.membership_end >= today,
                Member.membership_end <= end_date,
            )
        )
        return result.scalar_one()

    async def get_expired_not_synced(self, gym_id: UUID) -> list[Member]:
        """Members with membership_end in the past but status still ACTIVE."""
        today = today_ist()
        result = await self.db.execute(
            select(Member).where(
                Member.gym_id == gym_id,
                Member.is_deleted == False,  # noqa: E712
                Member.membership_status == MembershipStatus.ACTIVE,
                Member.membership_end.isnot(None),
                Member.membership_end < today,
            )
        )
        return list(result.scalars().all())

    async def count_by_status(self, gym_id: UUID, status: MembershipStatus) -> int:
        """Count members with a specific membership status."""
        result = await self.db.execute(
            select(func.count()).select_from(Member).where(
                Member.gym_id == gym_id,
                Member.is_deleted == False,  # noqa: E712
                Member.membership_status == status,
            )
        )
        return result.scalar_one()
