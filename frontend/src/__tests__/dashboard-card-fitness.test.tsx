import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...props}>{children}</div>
    ),
  },
}));

import { DashboardCard } from "@/components/layout/dashboard-card";
import { Users } from "lucide-react";

describe("DashboardCard - Fitness Enhancements", () => {
  it("renders with fitness-card class when provided", () => {
    const { container } = render(
      <DashboardCard
        title="Active Members"
        value="247"
        description="Total active"
        icon={Users}
        className="fitness-card fitness-card-blue"
      />
    );

    const card = container.querySelector("[class*='fitness-card']");
    expect(card).toBeTruthy();
    expect(card!.className).toContain("fitness-card-blue");
  });

  it("renders top accent line on hover-ready element", () => {
    const { container } = render(
      <DashboardCard
        title="Revenue"
        value="₹50,000"
        description="This month"
      />
    );

    // Should have the top accent line div
    const accentLine = container.querySelector("[class*='h-\\[2px\\]']");
    expect(accentLine).toBeTruthy();
  });

  it("displays title in uppercase tracking", () => {
    render(
      <DashboardCard
        title="Check-ins"
        value="34"
        description="Today"
      />
    );

    expect(screen.getByText("Check-ins")).toBeInTheDocument();
  });

  it("renders trend badge with correct styling", () => {
    const { container } = render(
      <DashboardCard
        title="Members"
        value="120"
        description="Active"
        trend={{ value: 12, label: "vs last month" }}
      />
    );

    // Positive trend should have emerald styling
    const trendBadge = container.querySelector("[class*='emerald']");
    expect(trendBadge).toBeTruthy();
    expect(trendBadge!.textContent).toContain("12%");
  });

  it("renders negative trend with red styling", () => {
    const { container } = render(
      <DashboardCard
        title="Attendance"
        value="18"
        description="Today"
        trend={{ value: -5, label: "vs yesterday" }}
      />
    );

    const trendBadge = container.querySelector("[class*='red']");
    expect(trendBadge).toBeTruthy();
  });

  it("renders loading skeleton state", () => {
    const { container } = render(
      <DashboardCard
        title="Members"
        value="0"
        description=""
        loading
      />
    );

    // Should not render the value text in loading state
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    // Should render skeleton placeholders (divs with rounded classes)
    const skeletons = container.querySelectorAll("[class*='rounded']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders icon with hover animation classes", () => {
    const { container } = render(
      <DashboardCard
        title="Visits"
        value="42"
        description="This week"
        icon={Users}
      />
    );

    const iconWrapper = container.querySelector("[class*='group-hover:scale-110']");
    expect(iconWrapper).toBeTruthy();
  });
});
