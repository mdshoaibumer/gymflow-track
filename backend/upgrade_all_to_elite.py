"""
One-time script: Upgrade ALL existing gym subscriptions to Elite plan with no restrictions.

Run this once to fix any gyms currently in locked/expired/starter state.
After running, all gyms will have:
- Elite plan (unlimited everything)
- ACTIVE status (no trial expiration)
- Trial end extended to 10 years from now

Usage:
    cd backend
    python upgrade_all_to_elite.py
"""

import asyncio
import sys
from datetime import timedelta
from uuid import UUID

sys.path.insert(0, ".")

from sqlalchemy import select, update
from app.core.database import async_session_factory, engine
from app.models.subscription import (
    GymSubscription,
    SubscriptionPlan,
    PlanTier,
    BillingStatus,
)
from app.services.billing_service import today_ist


async def upgrade_all_to_elite():
    async with async_session_factory() as session:
        # Get the Elite plan
        result = await session.execute(
            select(SubscriptionPlan).where(
                SubscriptionPlan.tier == PlanTier.ELITE,
                SubscriptionPlan.is_active == True,  # noqa: E712
            )
        )
        elite_plan = result.scalar_one_or_none()

        if not elite_plan:
            print("ERROR: Elite plan not found. Run the app once to seed plans first.")
            return

        print(f"Found Elite plan: {elite_plan.name} (id={elite_plan.id})")

        # Get all subscriptions
        result = await session.execute(select(GymSubscription))
        subscriptions = list(result.scalars().all())

        print(f"Found {len(subscriptions)} subscription(s) to upgrade")

        today = today_ist()
        new_trial_end = today + timedelta(days=3650)

        upgraded = 0
        for sub in subscriptions:
            changes = []
            if sub.plan_id != elite_plan.id:
                sub.plan_id = elite_plan.id
                changes.append("plan→Elite")
            if sub.status in (BillingStatus.EXPIRED, BillingStatus.CANCELLED):
                sub.status = BillingStatus.ACTIVE
                changes.append(f"status {sub.status.value}→active")
            if sub.trial_end and sub.trial_end < today + timedelta(days=365):
                sub.trial_end = new_trial_end
                changes.append("trial_end extended")

            if changes:
                upgraded += 1
                print(f"  Gym {sub.gym_id}: {', '.join(changes)}")

        if upgraded > 0:
            await session.commit()
            print(f"\nDone! Upgraded {upgraded} subscription(s) to Elite.")
        else:
            print("\nAll subscriptions are already on Elite plan. No changes needed.")


if __name__ == "__main__":
    asyncio.run(upgrade_all_to_elite())
