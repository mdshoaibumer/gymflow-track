
import asyncio
from uuid import UUID
from sqlalchemy import select, func
from app.core.database import async_session_factory
from app.models.member import Member, MembershipStatus

async def check_members():
    async with async_session_factory() as session:
        # Get all gyms first
        from app.models.gym import Gym
        gyms_result = await session.execute(select(Gym))
        gyms = gyms_result.scalars().all()
        print(f"Total gyms: {len(gyms)}")
        
        for gym in gyms:
            print(f"\nGym: {gym.name} ({gym.id})")
            
            # Count members
            stmt = select(func.count(Member.id)).where(Member.gym_id == gym.id)
            count = (await session.execute(stmt)).scalar_one()
            print(f"  Total members: {count}")
            
            # Count by status
            stmt = select(Member.membership_status, func.count(Member.id)).where(Member.gym_id == gym.id).group_by(Member.membership_status)
            status_counts = (await session.execute(stmt)).all()
            for status, s_count in status_counts:
                print(f"    Status {status}: {s_count}")
                
            # Count by plan for ACTIVE members
            stmt = select(Member.membership_plan, func.count(Member.id)).where(
                Member.gym_id == gym.id,
                Member.membership_status == MembershipStatus.ACTIVE
            ).group_by(Member.membership_plan)
            plan_counts = (await session.execute(stmt)).all()
            print(f"  Active member plans:")
            for plan, p_count in plan_counts:
                print(f"    Plan '{plan}': {p_count}")

if __name__ == "__main__":
    asyncio.run(check_members())
