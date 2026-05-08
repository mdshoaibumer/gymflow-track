import { DashboardCard } from "@/components/layout/dashboard-card";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Welcome back! Here&apos;s your gym overview.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Active Members"
          value="--"
          description="Currently active"
        />
        <DashboardCard
          title="Expiring Soon"
          value="--"
          description="Next 7 days"
        />
        <DashboardCard
          title="Revenue (Month)"
          value="₹--"
          description="Current month"
        />
        <DashboardCard
          title="Today's Attendance"
          value="--"
          description="Check-ins today"
        />
      </div>
    </div>
  );
}
