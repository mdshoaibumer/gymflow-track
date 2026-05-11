import asyncio
from app.core.database import async_session_factory
from app.models.subscription import SubscriptionPlan
from sqlalchemy import select

async def check():
    async with async_session_factory() as s:
        res = await s.execute(select(SubscriptionPlan))
        plans = res.scalars().all()
        for p in plans:
            print(f"Tier: {p.tier}")
            print(f"  Name: {p.name}")
            print(f"  QR: {p.qr_attendance_enabled}")
            print(f"  Analytics: {p.advanced_analytics_enabled}")
            print(f"  Export: {p.export_reports_enabled}")
            print(f"  Reports: {p.advanced_reports_enabled}")
            print("-" * 20)

if __name__ == "__main__":
    asyncio.run(check())
