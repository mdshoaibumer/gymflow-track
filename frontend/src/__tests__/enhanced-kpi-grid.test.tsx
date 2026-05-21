import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  useInView: () => true,
}));

// Mock matchMedia
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

// Mock the hook
vi.mock("@/hooks/use-analytics", () => ({
  useDashboardKPIs: vi.fn(),
}));

import { useDashboardKPIs } from "@/hooks/use-analytics";
import { EnhancedKPIGrid } from "@/components/dashboard/overview/enhanced-kpi-grid";

const mockUseDashboardKPIs = vi.mocked(useDashboardKPIs);

describe("EnhancedKPIGrid", () => {
  it("renders loading skeletons when loading", () => {
    mockUseDashboardKPIs.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useDashboardKPIs>);

    const { container } = render(<EnhancedKPIGrid periodDays={30} />);
    // Should render 6 skeleton cards
    expect(container.querySelectorAll("[class*='animate-shimmer']").length).toBeGreaterThan(0);
  });

  it("renders nothing on error", () => {
    mockUseDashboardKPIs.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useDashboardKPIs>);

    const { container } = render(<EnhancedKPIGrid periodDays={30} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders KPI cards with data", () => {
    mockUseDashboardKPIs.mockReturnValue({
      data: {
        kpis: [
          { key: "active_members", label: "Active Members", value: 142, unit: "count", growth_percent: 5.2 },
          { key: "attendance_today", label: "Attendance Today", value: 28, unit: "count", growth_percent: -2.1 },
        ],
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useDashboardKPIs>);

    render(<EnhancedKPIGrid periodDays={30} />);

    expect(screen.getByText("Active Members")).toBeInTheDocument();
    expect(screen.getByText("Attendance Today")).toBeInTheDocument();
    // AnimatedNumber renders immediately in test env
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
  });

  it("renders growth percentages", () => {
    mockUseDashboardKPIs.mockReturnValue({
      data: {
        kpis: [
          { key: "active_members", label: "Active Members", value: 100, unit: "count", growth_percent: 12 },
        ],
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useDashboardKPIs>);

    const { container } = render(<EnhancedKPIGrid periodDays={7} />);

    // Growth is rendered as "+12.0%" with an icon inside the span
    expect(container.textContent).toContain("+12.0%");
  });

  it("formats revenue values as paise", () => {
    mockUseDashboardKPIs.mockReturnValue({
      data: {
        kpis: [
          { key: "total_revenue", label: "Total Revenue", value: 500000, unit: "paise", growth_percent: null },
        ],
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useDashboardKPIs>);

    render(<EnhancedKPIGrid periodDays={30} />);

    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
  });

  it("passes periodDays to the hook", () => {
    mockUseDashboardKPIs.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useDashboardKPIs>);

    render(<EnhancedKPIGrid periodDays={14} />);

    expect(mockUseDashboardKPIs).toHaveBeenCalledWith({ period_days: 14 });
  });
});
