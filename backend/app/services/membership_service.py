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
from app.core.timezone import today_ist


class MembershipService:
    """Handles membership lifecycle transitions."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.member_repo = MemberRepository(db)

    # ************************************************************
    # Function Name : Compute Membership Status from Dates
    #
    # Purpose       : Derives the correct membership status based on
    # the member's end date and current manual overrides.
    # Frozen/cancelled statuses are preserved as-is.
    # This is the single source of truth for status
    # computation — does NOT persist changes.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
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

        if member.membership_end >= today_ist():
            return MembershipStatus.ACTIVE
        else:
            return MembershipStatus.EXPIRED

    # ************************************************************
    # Function Name : Synchronize Member Status
    #
    # Purpose       : Checks and corrects a member's status if it has
    # drifted from the computed value (e.g., an active
    # membership that has since expired). Called on
    # member access to keep status accurate without
    # requiring a cron job.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
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

    # ************************************************************
    # Function Name : Renew Membership Subscription
    #
    # Purpose       : Extends a member's membership by updating the
    # end date, optionally setting a new start date
    # and plan name. Transitions the membership status
    # to ACTIVE. Typically triggered after a successful
    # payment recording.
    #
    # Author        : Mohammed Shoaib U
    #
    # ************************************************************
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
            member.membership_start = today_ist()
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
