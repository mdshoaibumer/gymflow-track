import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
  useReducedMotion: () => false,
}));

// Mock utils
vi.mock("@/lib/utils", () => ({
  formatPaise: (v: number) => `₹${(v / 100).toLocaleString("en-IN")}`,
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

let mockIsAdminOrAbove = true;

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAdminOrAbove: mockIsAdminOrAbove }),
}));

// Mock dashboard hooks
vi.mock("@/hooks/use-payments", () => ({
  useDashboardMetrics: () => ({
    data: { active_members: 50, expired_members: 3, total_revenue_paise: 150000, pending_dues_count: 5 },
  }),
  useExpiringMembers: () => ({ data: [] }),
  useRecentPayments: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-attendance", () => ({
  useAttendanceStats: () => ({ data: null }),
  useAttendanceTrend: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-notifications", () => ({
  useNotificationStats: () => ({ data: null }),
}));

vi.mock("@/hooks/use-analytics", () => ({
  useDashboardKPIs: () => ({ data: null, isLoading: false, isError: false }),
}));

// Mock chart and other components
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => () => <div data-testid="dynamic-chart">Chart</div>,
}));

vi.mock("@/components/dashboard/overview/enhanced-kpi-grid", () => ({
  EnhancedKPIGrid: () => null,
}));

vi.mock("@/components/dashboard/filters/dashboard-filters", () => ({
  DashboardFilters: () => null,
  getFilterState: () => ({ periodDays: 30, dateFrom: "2026-05-07", dateTo: "2026-06-06" }),
}));

vi.mock("@/components/layout/dashboard-card", () => ({
  DashboardCard: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/live-indicator", () => ({
  LiveIndicator: () => <span>Live</span>,
}));

vi.mock("@/components/whatsapp/whatsapp-reminder-button", () => ({
  WhatsAppReminderButton: () => null,
}));

// --- Dues Summary Mock ---
let mockDuesSummary: {
  total_members_with_dues: number;
  total_outstanding_paise: number;
  collected_this_month_paise: number;
} | null = null;

vi.mock("@/hooks/use-dues", () => ({
  useDuesSummary: () => ({ data: mockDuesSummary }),
}));

import DashboardPage from "@/app/(dashboard)/dashboard/page";

describe("Dashboard - Dues Summary KPI Card", () => {
  beforeEach(() => {
    mockIsAdminOrAbove = true;
  });

  it("shows total outstanding amount and member count when dues exist", () => {
    mockDuesSummary = {
      total_members_with_dues: 15,
      total_outstanding_paise: 200000,
      collected_this_month_paise: 500000,
    };
    render(<DashboardPage />);
    expect(screen.getByText(/₹2,000 Pending/)).toBeInTheDocument();
    expect(screen.getByText(/from 15 members/)).toBeInTheDocument();
  });

  it("shows collected this month when available (desktop)", () => {
    mockDuesSummary = {
      total_members_with_dues: 3,
      total_outstanding_paise: 100000,
      collected_this_month_paise: 750000,
    };
    render(<DashboardPage />);
    expect(screen.getByText("Collected")).toBeInTheDocument();
    expect(screen.getByText("₹7,500")).toBeInTheDocument();
  });

  it("hides collected section when zero", () => {
    mockDuesSummary = {
      total_members_with_dues: 2,
      total_outstanding_paise: 50000,
      collected_this_month_paise: 0,
    };
    render(<DashboardPage />);
    expect(screen.queryByText("Collected")).not.toBeInTheDocument();
  });

  it("does not show dues card when no members have dues", () => {
    mockDuesSummary = {
      total_members_with_dues: 0,
      total_outstanding_paise: 0,
      collected_this_month_paise: 100000,
    };
    render(<DashboardPage />);
    expect(screen.queryByText(/Pending/)).not.toBeInTheDocument();
  });

  it("does not show dues card when summary is null (loading)", () => {
    mockDuesSummary = null;
    render(<DashboardPage />);
    expect(screen.queryByText(/Pending/)).not.toBeInTheDocument();
  });

  it("does not show dues card for staff users", () => {
    mockIsAdminOrAbove = false;
    mockDuesSummary = {
      total_members_with_dues: 15,
      total_outstanding_paise: 200000,
      collected_this_month_paise: 500000,
    };
    render(<DashboardPage />);
    expect(screen.queryByText(/from 15 members/)).not.toBeInTheDocument();
  });

  it("handles singular member text correctly", () => {
    mockDuesSummary = {
      total_members_with_dues: 1,
      total_outstanding_paise: 100000,
      collected_this_month_paise: 0,
    };
    render(<DashboardPage />);
    expect(screen.getByText(/from 1 member —/)).toBeInTheDocument();
  });

  it("links to collections page", () => {
    mockDuesSummary = {
      total_members_with_dues: 5,
      total_outstanding_paise: 300000,
      collected_this_month_paise: 0,
    };
    render(<DashboardPage />);
    const link = screen.getByText(/Pending/).closest("a");
    expect(link).toHaveAttribute("href", "/collections");
  });
});
