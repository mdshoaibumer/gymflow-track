import asyncio
from app.core.database import async_session_factory
from app.models.subscription import GymSubscription, SubscriptionPlan
from sqlalchemy import select
from uuid import UUID

async def check():
    gym_id = UUID("ab361e73-536e-4b29-916c-e3e45e447a0a")
    async with async_session_factory() as s:
        res = await s.execute(
            select(GymSubscription, SubscriptionPlan)
            .join(SubscriptionPlan, GymSubscription.plan_id == SubscriptionPlan.id)
            .where(GymSubscription.gym_id == gym_id)
        )
        row = res.first()
        if row:
            sub, plan = row
            print(f"Gym: {gym_id}")
            print(f"Plan Name: {plan.name}")
            print(f"Plan Tier: {plan.tier}")
            print(f"Subscription Status: {sub.status}")
            print(f"Features: QR={plan.qr_attendance_enabled}, Analytics={plan.advanced_analytics_enabled}, Export={plan.export_reports_enabled}")
        else:
            print("No subscription found")

if __name__ == "__main__":
    asyncio.run(check())
