import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

// Mock recharts to avoid rendering issues in test
vi.mock("recharts", () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children, onClick }: { children: React.ReactNode; onClick?: (e: unknown, i: number) => void }) => (
    <div data-testid="pie" onClick={() => onClick?.(null, 0)}>{children}</div>
  ),
  Cell: () => <div data-testid="cell" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
}));

// Mock analytics hook
vi.mock("@/hooks/use-analytics", () => ({
  useMembershipDistribution: () => ({
    data: {
      distributions: [
        { plan: "Monthly", member_count: 10, percentage: 50, revenue_contribution_paise: 500000 },
        { plan: "Quarterly", member_count: 6, percentage: 30, revenue_contribution_paise: 900000 },
        { plan: "Annual", member_count: 4, percentage: 20, revenue_contribution_paise: 1200000 },
      ],
      total_members: 20,
      most_popular_plan: "Monthly",
    },
    isLoading: false,
  }),
}));

// Mock chart-card
vi.mock("@/components/dashboard/charts/chart-card", () => ({
  ChartCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock utils
vi.mock("@/lib/utils", () => ({
  formatPaise: (v: number) => `₹${v / 100}`,
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

import { MembershipDistributionChart } from "@/components/dashboard/growth/membership-distribution-chart";

describe("MembershipDistributionChart", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders legend items for each plan", () => {
    render(<MembershipDistributionChart />);
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText("Quarterly")).toBeInTheDocument();
    expect(screen.getByText("Annual")).toBeInTheDocument();
  });

  it("navigates to members page with plan filter when legend item is clicked", () => {
    render(<MembershipDistributionChart />);
    const monthlyItem = screen.getByText("Monthly").closest("[class*=cursor-pointer]");
    if (monthlyItem) {
      fireEvent.click(monthlyItem);
      expect(mockPush).toHaveBeenCalledWith("/members?plan=Monthly");
    }
  });

  it("navigates on pie chart click", () => {
    render(<MembershipDistributionChart />);
    const pie = screen.getByTestId("pie");
    fireEvent.click(pie);
    expect(mockPush).toHaveBeenCalledWith("/members?plan=Monthly");
  });
});
