import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "test-member-id" }),
}));

// Mock hooks
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAdminOrAbove: true }),
}));

const mockMember = {
  id: "test-member-id",
  name: "Ravi Kumar",
  phone: "9876543210",
  email: "ravi@test.com",
  gender: "male",
  date_of_birth: "1995-06-15",
  emergency_contact: "9876500000",
  batch: "morning",
  membership_status: "active",
  membership_plan: "Quarterly",
  membership_start: "2026-01-01",
  membership_end: "2026-04-01",
  amount_paid: 300000,
  photo_url: null,
  custom_fields: null,
  version: 1,
};

vi.mock("@/hooks/use-members", () => ({
  useMember: () => ({ data: mockMember, isLoading: false }),
  useMemberTimeline: () => ({ data: { events: [], total: 0 } }),
}));

vi.mock("@/hooks/use-payments", () => ({
  useMemberPayments: () => ({ data: { payments: [] } }),
}));

vi.mock("@/hooks/use-invoices", () => ({
  useMemberInvoices: () => ({ data: { invoices: [] } }),
}));

vi.mock("@/hooks/use-attendance", () => ({
  useMemberAttendance: () => ({ data: { attendance: [], total: 0 } }),
}));

vi.mock("@/services/member.service", () => ({
  memberService: { overrideMembership: vi.fn() },
}));

vi.mock("@/services/invoice.service", () => ({
  invoiceService: { getDownloadUrl: (id: string) => `/invoices/${id}/pdf` },
}));

vi.mock("@/components/whatsapp/whatsapp-reminder-button", () => ({
  WhatsAppReminderButton: () => null,
}));

vi.mock("@/components/members/member-photo-upload", () => ({
  MemberPhotoUpload: () => <div data-testid="photo-upload" />,
}));

vi.mock("@/components/members/membership-override-form", () => ({
  MembershipOverrideForm: () => null,
}));

vi.mock("@/components/members/attendance-heatmap", () => ({
  AttendanceHeatmap: () => null,
}));

vi.mock("@/components/role-gate", () => ({
  RoleGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// --- Dues mock (key for balance badge tests) ---
let mockMemberDues: Array<{
  id: string;
  status: string;
  balance_paise: number;
  plan_name: string;
  due_date: string;
}> = [];

vi.mock("@/hooks/use-dues", () => ({
  useMemberDues: () => ({ data: mockMemberDues }),
}));

vi.mock("@/lib/utils", () => ({
  formatPaise: (v: number) => `₹${(v / 100).toLocaleString("en-IN")}`,
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Member Profile - Balance Badge", () => {
  it("shows balance badge when member has outstanding dues", async () => {
    mockMemberDues = [
      { id: "d1", status: "pending", balance_paise: 150000, plan_name: "Quarterly", due_date: "2026-05-01" },
      { id: "d2", status: "partial", balance_paise: 50000, plan_name: "Monthly", due_date: "2026-06-01" },
    ];
    const MemberDetailPage = (await import("@/app/(dashboard)/members/[id]/page")).default;
    render(<MemberDetailPage />, { wrapper: Wrapper });

    const badge = screen.getByTestId("balance-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("₹2,000 due");
  }, 20000);

  it("does not show balance badge when no outstanding dues", async () => {
    mockMemberDues = [
      { id: "d1", status: "paid", balance_paise: 0, plan_name: "Quarterly", due_date: "2026-05-01" },
    ];
    const MemberDetailPage = (await import("@/app/(dashboard)/members/[id]/page")).default;
    render(<MemberDetailPage />, { wrapper: Wrapper });

    expect(screen.queryByTestId("balance-badge")).not.toBeInTheDocument();
  }, 20000);

  it("does not show balance badge when dues data is empty", async () => {
    mockMemberDues = [];
    const MemberDetailPage = (await import("@/app/(dashboard)/members/[id]/page")).default;
    render(<MemberDetailPage />, { wrapper: Wrapper });

    expect(screen.queryByTestId("balance-badge")).not.toBeInTheDocument();
  }, 20000);

  it("shows outstanding dues alert card with amount and count", async () => {
    mockMemberDues = [
      { id: "d1", status: "pending", balance_paise: 100000, plan_name: "Quarterly", due_date: "2026-05-01" },
      { id: "d2", status: "pending", balance_paise: 100000, plan_name: "Monthly", due_date: "2026-06-01" },
      { id: "d3", status: "paid", balance_paise: 0, plan_name: "Monthly", due_date: "2026-04-01" },
    ];
    const MemberDetailPage = (await import("@/app/(dashboard)/members/[id]/page")).default;
    render(<MemberDetailPage />, { wrapper: Wrapper });

    expect(screen.getByText("₹2,000 Outstanding")).toBeInTheDocument();
    expect(screen.getByText(/2 pending dues/)).toBeInTheDocument();
  }, 20000);

  it("shows singular 'due' text for single pending due", async () => {
    mockMemberDues = [
      { id: "d1", status: "partial", balance_paise: 75000, plan_name: "Monthly", due_date: "2026-06-01" },
    ];
    const MemberDetailPage = (await import("@/app/(dashboard)/members/[id]/page")).default;
    render(<MemberDetailPage />, { wrapper: Wrapper });

    expect(screen.getByText("₹750 due")).toBeInTheDocument();
    expect(screen.getByText(/1 pending due —/)).toBeInTheDocument();
  }, 20000);

  it("outstanding alert links to collections page", async () => {
    mockMemberDues = [
      { id: "d1", status: "pending", balance_paise: 100000, plan_name: "Monthly", due_date: "2026-06-01" },
    ];
    const MemberDetailPage = (await import("@/app/(dashboard)/members/[id]/page")).default;
    render(<MemberDetailPage />, { wrapper: Wrapper });

    const link = screen.getByText("₹1,000 Outstanding").closest("a");
    expect(link).toHaveAttribute("href", "/collections");
  }, 20000);

  it("badge is visible alongside status badge (mobile friendly layout)", async () => {
    mockMemberDues = [
      { id: "d1", status: "pending", balance_paise: 200000, plan_name: "Quarterly", due_date: "2026-05-01" },
    ];
    const MemberDetailPage = (await import("@/app/(dashboard)/members/[id]/page")).default;
    render(<MemberDetailPage />, { wrapper: Wrapper });

    const balanceBadge = screen.getByTestId("balance-badge");
    expect(balanceBadge).toBeInTheDocument();

    // Badge should be in a flex-col container for vertical stacking on mobile
    const container = balanceBadge.closest("[class*='flex-col']");
    expect(container).not.toBeNull();
    // Container should also contain the status badge
    expect(container!.querySelectorAll("[class*='capitalize']").length).toBeGreaterThanOrEqual(1);
  }, 20000);
});
