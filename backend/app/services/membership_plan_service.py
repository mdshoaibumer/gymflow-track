"""Service for managing gym membership plans (CRUD)."""
import uuid
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.membership_plan import GymMembershipPlan
from app.schemas.membership_plan import MembershipPlanCreateRequest, MembershipPlanUpdateRequest

logger = logging.getLogger("gymflow.membership_plans")


class MembershipPlanService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_plans(self, gym_id: uuid.UUID, active_only: bool = True) -> list[GymMembershipPlan]:
        """List all membership plans for a gym, ordered by amount."""
        stmt = select(GymMembershipPlan).where(GymMembershipPlan.gym_id == gym_id)
        if active_only:
            stmt = stmt.where(GymMembershipPlan.is_active == True)  # noqa: E712
        stmt = stmt.order_by(GymMembershipPlan.amount)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_plan(self, gym_id: uuid.UUID, data: MembershipPlanCreateRequest) -> GymMembershipPlan:
        """Create a new membership plan for the gym."""
        plan = GymMembershipPlan(
            gym_id=gym_id,
            name=data.name.strip(),
            duration_months=data.duration_months,
            amount=data.amount,
        )
        self.db.add(plan)
        await self.db.flush()
        await self.db.refresh(plan)
        logger.info("Membership plan created: %s (₹%d/%d mo) for gym %s", data.name, data.amount, data.duration_months, gym_id)
        return plan

    async def update_plan(
        self, gym_id: uuid.UUID, plan_id: uuid.UUID, data: MembershipPlanUpdateRequest
    ) -> GymMembershipPlan | None:
        """Update a membership plan. Returns None if not found."""
        stmt = select(GymMembershipPlan).where(
            GymMembershipPlan.id == plan_id,
            GymMembershipPlan.gym_id == gym_id,
        )
        result = await self.db.execute(stmt)
        plan = result.scalar_one_or_none()
        if not plan:
            return None

        if data.name is not None:
            plan.name = data.name.strip()
        if data.duration_months is not None:
            plan.duration_months = data.duration_months
        if data.amount is not None:
            plan.amount = data.amount
        if data.is_active is not None:
            plan.is_active = data.is_active

        await self.db.flush()
        await self.db.refresh(plan)
        logger.info("Membership plan updated: %s (id=%s) for gym %s", plan.name, plan_id, gym_id)
        return plan

    async def delete_plan(self, gym_id: uuid.UUID, plan_id: uuid.UUID) -> bool:
        """Soft-delete a membership plan by marking it inactive."""
        stmt = select(GymMembershipPlan).where(
            GymMembershipPlan.id == plan_id,
            GymMembershipPlan.gym_id == gym_id,
        )
        result = await self.db.execute(stmt)
        plan = result.scalar_one_or_none()
        if not plan:
            return False

        plan.is_active = False
        await self.db.flush()
        logger.info("Membership plan deleted: %s (id=%s) for gym %s", plan.name, plan_id, gym_id)
        return True
