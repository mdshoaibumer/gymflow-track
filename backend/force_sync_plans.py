import asyncio
from uuid import UUID
from app.core.database import async_session_factory
from app.models.subscription import SubscriptionPlan, PlanTier, BillingInterval
from sqlalchemy import select, update, text

async def sync():
    plan_definitions = [
        {
            "tier": PlanTier.STARTER,
            "name": "Starter",
            "price_in_paise": 99900,
            "yearly_price_in_paise": 999900,
            "description": "For small gyms getting started. Up to 100 active members.",
            "max_members": 100,
            "max_staff_users": 2,
            "sms_notifications_enabled": True,
            "advanced_reports_enabled": False,
            "qr_attendance_enabled": False,
            "advanced_analytics_enabled": False,
            "export_reports_enabled": False,
            "multi_branch_enabled": False,
            "automated_whatsapp_enabled": False,
        },
        {
            "tier": PlanTier.PRO,
            "name": "Pro",
            "price_in_paise": 199900,
            "yearly_price_in_paise": 1999900,
            "description": "For growing gyms. Up to 500 members, QR attendance, analytics, and exports.",
            "max_members": 500,
            "max_staff_users": 5,
            "sms_notifications_enabled": True,
            "advanced_reports_enabled": True,
            "qr_attendance_enabled": True,
            "advanced_analytics_enabled": True,
            "export_reports_enabled": True,
            "multi_branch_enabled": False,
            "automated_whatsapp_enabled": False,
        },
        {
            "tier": PlanTier.ELITE,
            "name": "Elite",
            "price_in_paise": 299900,
            "yearly_price_in_paise": 2999900,
            "description": "Unlimited members, all features, multi-branch, automated WhatsApp, dedicated support.",
            "max_members": 999999,
            "max_staff_users": 999999,
            "sms_notifications_enabled": True,
            "advanced_reports_enabled": True,
            "qr_attendance_enabled": True,
            "advanced_analytics_enabled": True,
            "export_reports_enabled": True,
            "multi_branch_enabled": True,
            "automated_whatsapp_enabled": True,
        },
    ]

    async with async_session_factory() as s:
        async with s.begin():
            # 1. Handle 'enterprise' tier if it exists (rename to 'elite' or delete if elite exists)
            # Check if both exist
            res_enterprise = await s.execute(text("SELECT id FROM subscription_plans WHERE tier = 'enterprise'"))
            enterprise_id = res_enterprise.scalar()
            res_elite = await s.execute(text("SELECT id FROM subscription_plans WHERE tier = 'elite'"))
            elite_id = res_elite.scalar()

            if enterprise_id and elite_id:
                # Update any subscriptions pointing to enterprise to point to elite
                await s.execute(text(f"UPDATE gym_subscriptions SET plan_id = '{elite_id}' WHERE plan_id = '{enterprise_id}'"))
                # Delete enterprise plan
                await s.execute(text(f"DELETE FROM subscription_plans WHERE id = '{enterprise_id}'"))
                print("Merged enterprise into elite.")
            elif enterprise_id:
                # Rename enterprise to elite
                await s.execute(text("UPDATE subscription_plans SET tier = 'elite' WHERE tier = 'enterprise'"))
                print("Renamed enterprise to elite.")
            
            # 2. Sync each plan
            for defn in plan_definitions:
                # Check if exists
                res = await s.execute(select(SubscriptionPlan).where(SubscriptionPlan.tier == defn["tier"]))
                plan = res.scalar_one_or_none()
                
                if plan:
                    print(f"Updating plan: {defn['name']} ({defn['tier']})")
                    for key, value in defn.items():
                        setattr(plan, key, value)
                else:
                    print(f"Creating plan: {defn['name']} ({defn['tier']})")
                    plan = SubscriptionPlan(
                        billing_interval=BillingInterval.MONTHLY,
                        is_active=True,
                        **defn
                    )
                    s.add(plan)
            
            print("Sync complete.")

if __name__ == "__main__":
    asyncio.run(sync())
