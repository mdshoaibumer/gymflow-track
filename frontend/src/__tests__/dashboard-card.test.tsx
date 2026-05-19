import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardCard } from "@/components/layout/dashboard-card";
import { Users } from "lucide-react";

describe("DashboardCard", () => {
  it("renders title, value, and description", () => {
    render(
      <DashboardCard title="Total Members" value="142" description="+5 this week" />
    );

    expect(screen.getByText("Total Members")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("+5 this week")).toBeInTheDocument();
  });

  it("renders loading skeleton when loading is true", () => {
    const { container } = render(
      <DashboardCard title="Revenue" value="$500" description="monthly" loading />
    );

    // Should not show actual content when loading
    expect(screen.queryByText("$500")).not.toBeInTheDocument();
    // Skeleton uses animate-shimmer class
    expect(container.querySelectorAll("[class*='animate-shimmer']").length).toBeGreaterThan(0);
  });

  it("renders an icon when provided", () => {
    const { container } = render(
      <DashboardCard title="Members" value="50" description="active" icon={Users} />
    );

    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("does not render icon container when icon is not provided", () => {
    const { container } = render(
      <DashboardCard title="Test" value="10" description="desc" />
    );

    // No icon wrapper with bg-primary classes
    expect(container.querySelector("[class*='bg-primary']")).not.toBeInTheDocument();
  });

  it("renders positive trend", () => {
    render(
      <DashboardCard
        title="Members"
        value="100"
        description="Total"
        trend={{ value: 12, label: "vs last month" }}
      />
    );

    expect(screen.getByText("+12%")).toBeInTheDocument();
  });

  it("renders negative trend", () => {
    render(
      <DashboardCard
        title="Revenue"
        value="$200"
        description="Total"
        trend={{ value: -5, label: "vs last month" }}
      />
    );

    expect(screen.getByText("-5%")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <DashboardCard title="Test" value="1" description="d" className="custom-card" />
    );

    // The card wrapper should have the custom class
    expect(container.firstChild).toHaveClass("custom-card");
  });
});
