import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/collections",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, ...props }: { children: React.ReactNode; className?: string }) => (
      <div className={className} {...props}>{children}</div>
    ),
  },
}));

// Mock auth
let mockRole = "owner";
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    role: mockRole,
    isOwner: mockRole === "owner",
    isAdminOrAbove: mockRole === "owner" || mockRole === "admin",
  }),
}));

vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (s: { token: string; user: { gym_id: string }; role: string }) => unknown) =>
    selector({ token: "test-token", user: { gym_id: "gym-1" }, role: mockRole }),
}));

// Mock dues hooks
const mockDues = {
  items: [
    {
      id: "due-1",
      gym_id: "gym-1",
      member_id: "mem-1",
      plan_name: "Quarterly",
      plan_amount_paise: 300000,
      discount_paise: 0,
      effective_amount_paise: 300000,
      total_paid_paise: 200000,
      balance_paise: 100000,
      due_date: "2026-05-01",
      status: "partial" as const,
      waive_reason: null,
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-15T00:00:00Z",
      member: { id: "mem-1", name: "Rahul Kumar", phone: "9876543210", photo_url: null },
    },
    {
      id: "due-2",
      gym_id: "gym-1",
      member_id: "mem-2",
      plan_name: "Monthly",
      plan_amount_paise: 150000,
      discount_paise: 0,
      effective_amount_paise: 150000,
      total_paid_paise: 0,
      balance_paise: 150000,
      due_date: "2026-04-15",
      status: "pending" as const,
      waive_reason: null,
      created_at: "2026-04-15T00:00:00Z",
      updated_at: "2026-04-15T00:00:00Z",
      member: { id: "mem-2", name: "Priya Sharma", phone: "9988776655", photo_url: null },
    },
  ],
  total: 2,
  total_outstanding_paise: 250000,
};

const mockSummary = {
  total_members_with_dues: 2,
  total_outstanding_paise: 250000,
  collected_this_month_paise: 80000,
};

vi.mock("@/hooks/use-dues", () => ({
  useDues: () => ({
    data: mockDues,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useDuesSummary: () => ({
    data: mockSummary,
  }),
  useDuesAgingReport: () => ({
    data: {
      buckets: [
        { range: "0-30", count: 1, total_paise: 100000 },
        { range: "31-60", count: 1, total_paise: 150000 },
        { range: "61-90", count: 0, total_paise: 0 },
        { range: "90+", count: 0, total_paise: 0 },
      ],
      total_outstanding_paise: 250000,
    },
    isLoading: false,
  }),
  usePayDue: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useWaiveDue: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

// Mock column-filters component
vi.mock("@/components/column-filters", () => ({
  ColumnFilters: ({ definitions }: { definitions: { key: string; label: string }[] }) => (
    <div data-testid="column-filters">
      {definitions.map((d) => (
        <span key={d.key}>{d.label}</span>
      ))}
    </div>
  ),
}));

// Mock pagination-controls component
vi.mock("@/components/pagination-controls", () => ({
  PaginationControls: () => <div data-testid="pagination" />,
}));

// Mock empty-state component
vi.mock("@/components/empty-state", () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));

// Mock role-gate
vi.mock("@/components/role-gate", () => ({
  RoleGate: ({ children, allowed }: { children: React.ReactNode; allowed: string[] }) => {
    if (allowed.includes(mockRole)) return <>{children}</>;
    return null;
  },
}));

// Mock modals
vi.mock("@/components/collections/pay-due-modal", () => ({
  PayDueModal: ({ open }: { open: boolean }) => open ? <div data-testid="pay-modal">Pay Modal</div> : null,
}));

vi.mock("@/components/collections/waive-due-modal", () => ({
  WaiveDueModal: ({ open }: { open: boolean }) => open ? <div data-testid="waive-modal">Waive Modal</div> : null,
}));

// Mock aging report
vi.mock("@/components/collections/aging-report", () => ({
  AgingReport: () => <div data-testid="aging-report">Aging Report</div>,
}));

import CollectionsPage from "@/app/(dashboard)/collections/page";

describe("CollectionsPage", () => {
  beforeEach(() => {
    mockRole = "owner";
  });

  it("renders the page title", () => {
    render(<CollectionsPage />);
    expect(screen.getByText("Collections")).toBeInTheDocument();
    expect(screen.getByText("Track and collect outstanding dues from members")).toBeInTheDocument();
  });

  it("displays summary cards with correct values", () => {
    render(<CollectionsPage />);
    // Total Outstanding
    expect(screen.getByText("Total Outstanding")).toBeInTheDocument();
    expect(screen.getAllByText("₹2,500").length).toBeGreaterThan(0);
    // Members with Dues
    expect(screen.getByText("Members with Dues")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // Collected This Month
    expect(screen.getByText("Collected This Month")).toBeInTheDocument();
    expect(screen.getByText("₹800")).toBeInTheDocument();
  });

  it("renders the aging report component", () => {
    render(<CollectionsPage />);
    expect(screen.getByTestId("aging-report")).toBeInTheDocument();
  });

  it("renders dues table with member names (desktop)", () => {
    render(<CollectionsPage />);
    expect(screen.getAllByText("Rahul Kumar").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Priya Sharma").length).toBeGreaterThan(0);
  });

  it("displays due amounts", () => {
    render(<CollectionsPage />);
    // ₹1,000 balance for first due
    expect(screen.getAllByText("₹1,000").length).toBeGreaterThan(0);
    // ₹1,500 balance for second due
    expect(screen.getAllByText("₹1,500").length).toBeGreaterThan(0);
  });

  it("shows status badges", () => {
    render(<CollectionsPage />);
    expect(screen.getAllByText("Partial").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });

  it("shows plan names", () => {
    render(<CollectionsPage />);
    expect(screen.getAllByText("Quarterly").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Monthly").length).toBeGreaterThan(0);
  });

  it("renders pagination controls", () => {
    render(<CollectionsPage />);
    expect(screen.getByTestId("pagination")).toBeInTheDocument();
  });

  it("renders column filters", () => {
    render(<CollectionsPage />);
    expect(screen.getByTestId("column-filters")).toBeInTheDocument();
  });
});

describe("CollectionsPage - mobile cards", () => {
  beforeEach(() => {
    mockRole = "owner";
  });

  it("renders mobile action buttons for pending dues", () => {
    render(<CollectionsPage />);
    // Mobile cards have "Pay" buttons
    const payButtons = screen.getAllByText("Pay");
    expect(payButtons.length).toBeGreaterThan(0);
  });

  it("renders WhatsApp remind button on mobile", () => {
    render(<CollectionsPage />);
    const remindButtons = screen.getAllByText("Remind");
    expect(remindButtons.length).toBeGreaterThan(0);
  });

  it("renders waive button for owner role on mobile", () => {
    render(<CollectionsPage />);
    const waiveButtons = screen.getAllByText("Waive");
    expect(waiveButtons.length).toBeGreaterThan(0);
  });
});

describe("CollectionsPage - RBAC", () => {
  it("hides waive button for admin role", () => {
    mockRole = "admin";
    render(<CollectionsPage />);
    expect(screen.queryByText("Waive")).not.toBeInTheDocument();
  });
});
