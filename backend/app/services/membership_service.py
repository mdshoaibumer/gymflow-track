"""
Membership lifecycle business logic.

Centralized rules:
- Status is derived from membership_end date
- ACTIVE: membership_end >= today
- EXPIRED: membership_end < today (auto-detected)
- PENDING: no dates set yet
- FROZEN: manually paused
- CANCELLED: manually terminated

Renewal = new payment + extend membership_end → status becomes ACTIVE.
"""

from datetime import date
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member, MembershipStatus
from app.repositories.member_repository import MemberRepository


class MembershipService:
    """Handles membership lifecycle transitions."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.member_repo = MemberRepository(db)

    def compute_status(self, member: Member) -> MembershipStatus:
        """
        Derive the correct membership status from dates.
        Does NOT persist — caller decides whether to write.

        Rules:
        - If frozen or cancelled → keep as-is (manual override)
        - If no membership_end → PENDING
        - If membership_end >= today → ACTIVE
        - If membership_end < today → EXPIRED
        """
        if member.membership_status in (
            MembershipStatus.FROZEN,
            MembershipStatus.CANCELLED,
        ):
            return member.membership_status

        if member.membership_end is None:
            return MembershipStatus.PENDING

        if member.membership_end >= date.today():
            return MembershipStatus.ACTIVE
        else:
            return MembershipStatus.EXPIRED

    async def sync_member_status(self, member: Member) -> Member:
        """
        Check and update a member's status if it has drifted.
        Called on member access to keep status accurate without cron.
        """
        correct_status = self.compute_status(member)
        if member.membership_status != correct_status:
            member.membership_status = correct_status
            await self.member_repo.update(member)
        return member

    async def renew_membership(
        self,
        member: Member,
        new_end: date,
        new_start: date | None = None,
        plan: str | None = None,
    ) -> Member:
        """
        Renew a membership: extend end date, optionally update start and plan.
        Transitions status to ACTIVE.
        """
        member.membership_end = new_end
        if new_start:
            member.membership_start = new_start
        elif member.membership_start is None:
            member.membership_start = date.today()
        if plan:
            member.membership_plan = plan
        member.membership_status = MembershipStatus.ACTIVE
        return await self.member_repo.update(member)

    async def freeze_membership(self, member: Member) -> Member:
        """Manually freeze a membership (e.g., medical leave)."""
        member.membership_status = MembershipStatus.FROZEN
        return await self.member_repo.update(member)

    async def cancel_membership(self, member: Member) -> Member:
        """Permanently cancel a membership."""
        member.membership_status = MembershipStatus.CANCELLED
        return await self.member_repo.update(member)

    async def get_expiring_members(
        self, gym_id: UUID, within_days: int = 7
    ) -> list[Member]:
        """
        Find members whose membership expires within N days.
        Used for dashboard warnings and future notification hooks.
        """
        return await self.member_repo.get_expiring_soon(gym_id, within_days)

    async def get_expired_members(self, gym_id: UUID) -> list[Member]:
        """Find members whose membership has already expired but status wasn't updated."""
        return await self.member_repo.get_expired_not_synced(gym_id)
