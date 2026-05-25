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

vi.mock("@/hooks/use-members", () => ({
  useMember: () => ({
    data: {
      id: "test-member-id",
      name: "John Doe",
      phone: "9876543210",
      email: "john@test.com",
      gender: "male",
      date_of_birth: "1995-06-15",
      emergency_contact: "9876500000",
      batch: "morning",
      membership_status: "active",
      membership_plan: "Monthly",
      membership_start: "2025-01-01",
      membership_end: "2025-02-01",
      amount_paid: 200000,
      photo_url: null,
      custom_fields: null,
      version: 1,
    },
    isLoading: false,
  }),
  useMembers: () => ({
    data: { members: [], total: 0 },
    isLoading: false,
  }),
  useCreateMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMemberTabSync: () => {},
  useMemberTimeline: () => ({ data: { events: [], total: 0 } }),
}));

vi.mock("@/hooks/use-payments", () => ({
  useMemberPayments: () => ({
    data: { payments: [] },
  }),
}));

vi.mock("@/hooks/use-invoices", () => ({
  useMemberInvoices: () => ({
    data: { invoices: [] },
  }),
  useInvoice: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/hooks/use-attendance", () => ({
  useMemberAttendance: () => ({
    data: {
      attendance: [
        {
          id: "att-1",
          check_in_at: "2025-01-15T08:30:00Z",
          check_out_at: "2025-01-15T10:00:00Z",
          source: "manual",
          member_id: "test-member-id",
          gym_id: "gym-1",
          check_in_date: "2025-01-15",
          status: "checked_out",
          recorded_by: null,
          member_name: "John Doe",
          member_phone: "9876543210",
        },
      ],
      total: 1,
    },
  }),
}));

vi.mock("@/services/member.service", () => ({
  memberService: {
    overrideMembership: vi.fn(),
    bulkChangeStatus: vi.fn(),
  },
}));

vi.mock("@/services/invoice.service", () => ({
  invoiceService: {
    getDownloadUrl: (id: string) => `/invoices/${id}/pdf`,
  },
}));

vi.mock("@/components/whatsapp/whatsapp-reminder-button", () => ({
  WhatsAppReminderButton: () => null,
}));

vi.mock("@/components/members/member-photo-upload", () => ({
  MemberPhotoUpload: () => null,
}));

vi.mock("@/components/members/membership-override-form", () => ({
  MembershipOverrideForm: () => null,
}));

vi.mock("@/components/role-gate", () => ({
  RoleGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Member Detail Page - New Features", () => {
  it(
    "displays date of birth and emergency contact",
    async () => {
      const MemberDetailPage = (await import("@/app/(dashboard)/members/[id]/page")).default;
      render(<MemberDetailPage />, { wrapper: Wrapper });

      expect(screen.getByText("Date of Birth:")).toBeDefined();
      expect(screen.getByText("Emergency Contact:")).toBeDefined();
      expect(screen.getByText("9876500000")).toBeDefined();
    },
    15000,
  );

  it("shows Renew Membership button", async () => {
    const MemberDetailPage = (await import("@/app/(dashboard)/members/[id]/page")).default;
    render(<MemberDetailPage />, { wrapper: Wrapper });

    expect(screen.getAllByText("Renew Membership").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Freeze button for active member", async () => {
    const MemberDetailPage = (await import("@/app/(dashboard)/members/[id]/page")).default;
    render(<MemberDetailPage />, { wrapper: Wrapper });

    expect(screen.getByText("Freeze")).toBeDefined();
  });

  it("shows tab navigation with Attendance History", async () => {
    const MemberDetailPage = (await import("@/app/(dashboard)/members/[id]/page")).default;
    render(<MemberDetailPage />, { wrapper: Wrapper });

    // Tab buttons exist (text may also appear in card titles, so use getAllByText)
    expect(screen.getAllByText("Payment History").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Attendance History").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Invoices").length).toBeGreaterThanOrEqual(1);
  });
});

describe("Invoice View - Discount Display", () => {
  it("shows discount section when discount > 0", async () => {
    const { InvoiceView } = await import("@/components/invoices/invoice-view");
    const invoice = {
      id: "inv-1",
      invoice_number: "INV-001",
      invoice_date: "2025-01-15",
      gym_name: "Test Gym",
      gym_address: null,
      gym_phone: null,
      gym_logo_url: null,
      member_name: "John Doe",
      member_phone: "9876543210",
      amount_in_paise: 200000,
      discount_in_paise: 50000,
      payment_method: "cash",
      payment_date: "2025-01-15",
      plan_name: "Monthly",
      notes: null,
      created_at: "2025-01-15T00:00:00Z",
    };
    render(<InvoiceView invoice={invoice} onDownloadPdf={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText("Discount")).toBeDefined();
    // Should show net total (2000 - 500 = 1500)
    expect(screen.getByText("₹1,500.00")).toBeDefined();
  });

  it("hides discount section when discount is 0", async () => {
    const { InvoiceView } = await import("@/components/invoices/invoice-view");
    const invoice = {
      id: "inv-2",
      invoice_number: "INV-002",
      invoice_date: "2025-01-15",
      gym_name: "Test Gym",
      gym_address: null,
      gym_phone: null,
      gym_logo_url: null,
      member_name: "John Doe",
      member_phone: "9876543210",
      amount_in_paise: 200000,
      discount_in_paise: 0,
      payment_method: "upi",
      payment_date: "2025-01-15",
      plan_name: "Monthly",
      notes: null,
      created_at: "2025-01-15T00:00:00Z",
    };
    render(<InvoiceView invoice={invoice} onDownloadPdf={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.queryByText("Discount")).toBeNull();
    // Total should just be the amount (appears in line item + total)
    expect(screen.getAllByText("₹2,000.00").length).toBeGreaterThanOrEqual(1);
  });
});
