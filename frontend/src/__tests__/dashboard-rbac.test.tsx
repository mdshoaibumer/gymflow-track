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

// Track whether useAuth returns admin or staff
let mockIsAdminOrAbove = true;

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAdminOrAbove: mockIsAdminOrAbove }),
}));

// Mock dashboard hooks
const mockMetrics = {
  active_members: 50,
  expired_members: 3,
  total_revenue_paise: 150000,
  pending_dues_count: 5,
};

vi.mock("@/hooks/use-payments", () => ({
  useDashboardMetrics: () => ({ data: mockIsAdminOrAbove ? mockMetrics : undefined }),
  useExpiringMembers: () => ({
    data: [
      { id: "1", name: "John", phone: "9876543210", membership_end: "2026-06-10", membership_plan: "Monthly" },
    ],
  }),
  useRecentPayments: () => ({
    data: mockIsAdminOrAbove
      ? [{ id: "p1", payment_method: "upi", payment_date: "2026-06-01", amount_in_paise: 200000 }]
      : [],
  }),
}));

vi.mock("@/hooks/use-attendance", () => ({
  useAttendanceStats: () => ({
    data: { checked_in_today: 12, currently_in_gym: 5, total_this_week: 45 },
  }),
  useAttendanceTrend: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-notifications", () => ({
  useNotificationStats: () => ({ data: null }),
}));

vi.mock("@/hooks/use-analytics", () => ({
  useDashboardKPIs: () => ({
    data: mockIsAdminOrAbove
      ? { kpis: [{ key: "total_revenue", label: "Revenue", value: 150000, unit: "paise", change_percent: 5 }] }
      : undefined,
    isLoading: false,
    isError: !mockIsAdminOrAbove,
  }),
}));

// Mock chart components
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => () => <div data-testid="dynamic-chart">Chart</div>,
}));

vi.mock("@/components/dashboard/overview/enhanced-kpi-grid", () => ({
  EnhancedKPIGrid: ({ enabled }: { enabled?: boolean }) =>
    enabled ? <div data-testid="kpi-grid">KPI Grid</div> : null,
}));

vi.mock("@/components/dashboard/filters/dashboard-filters", () => ({
  DashboardFilters: () => <div data-testid="dashboard-filters">Filters</div>,
  getFilterState: () => ({ periodDays: 30, dateFrom: "2026-05-07", dateTo: "2026-06-06" }),
}));

vi.mock("@/components/layout/dashboard-card", () => ({
  DashboardCard: ({ title }: { title: string }) => <div data-testid="dashboard-card">{title}</div>,
}));

vi.mock("@/components/live-indicator", () => ({
  LiveIndicator: () => <span>Live</span>,
}));

vi.mock("@/components/whatsapp/whatsapp-reminder-button", () => ({
  WhatsAppReminderButton: () => <button>WhatsApp</button>,
}));

import DashboardPage from "@/app/(dashboard)/dashboard/page";

describe("Dashboard RBAC - Admin/Owner View", () => {
  beforeEach(() => {
    mockIsAdminOrAbove = true;
  });

  it("shows KPI grid for admin users", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("kpi-grid")).toBeInTheDocument();
  });

  it("shows dashboard filters for admin users", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("dashboard-filters")).toBeInTheDocument();
  });

  it("shows Payment Activity section for admin users", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Payment Activity")).toBeInTheDocument();
  });

  it("shows pending dues alert for admin users", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/Pending Due/)).toBeInTheDocument();
  });

  it("shows expiring memberships for admin users", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Expiring Memberships")).toBeInTheDocument();
    expect(screen.getByText("John")).toBeInTheDocument();
  });

  it("shows attendance stats for admin users", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Checked In Today")).toBeInTheDocument();
    expect(screen.getByText("In Gym Now")).toBeInTheDocument();
  });

  it("shows analytics overview subtitle for admin users", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/gym analytics overview/)).toBeInTheDocument();
  });
});

describe("Dashboard RBAC - Staff View", () => {
  beforeEach(() => {
    mockIsAdminOrAbove = false;
  });

  it("does NOT show KPI grid for staff users", () => {
    render(<DashboardPage />);
    expect(screen.queryByTestId("kpi-grid")).not.toBeInTheDocument();
  });

  it("does NOT show dashboard filters for staff users", () => {
    render(<DashboardPage />);
    expect(screen.queryByTestId("dashboard-filters")).not.toBeInTheDocument();
  });

  it("does NOT show Payment Activity section for staff users", () => {
    render(<DashboardPage />);
    expect(screen.queryByText("Payment Activity")).not.toBeInTheDocument();
  });

  it("does NOT show pending dues alert for staff users", () => {
    render(<DashboardPage />);
    expect(screen.queryByText(/Pending Due/)).not.toBeInTheDocument();
  });

  it("DOES show expiring memberships for staff users", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Expiring Memberships")).toBeInTheDocument();
    expect(screen.getByText("John")).toBeInTheDocument();
  });

  it("DOES show attendance stats for staff users", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Checked In Today")).toBeInTheDocument();
    expect(screen.getByText("In Gym Now")).toBeInTheDocument();
  });

  it("shows operational overview subtitle for staff users", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/operational overview/)).toBeInTheDocument();
  });
});
