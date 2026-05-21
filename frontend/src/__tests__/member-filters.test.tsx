import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock next/navigation
const mockSearchParams = new URLSearchParams("status=expired");
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock hooks
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAdminOrAbove: true }),
}));

vi.mock("@/hooks/use-members", () => ({
  useMembers: () => ({
    data: { members: [], total: 0 },
    isLoading: false,
  }),
  useCreateMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMemberTabSync: () => {},
}));

vi.mock("@/hooks/use-feature-access", () => ({
  useUsageInfo: () => ({
    isLoading: false,
    isUnlimitedMembers: true,
    currentMembers: 0,
    maxMembers: 100,
    memberWarningLevel: "none",
  }),
}));

vi.mock("@/hooks/use-gym", () => ({
  useGym: () => ({ data: { id: "gym-1", name: "Test Gym" } }),
}));

vi.mock("@/lib/membership-plans", () => ({
  getPlans: () => [
    { id: "1", name: "Monthly", duration_months: 1, amount: 1000 },
    { id: "2", name: "Quarterly", duration_months: 3, amount: 2500 },
  ],
}));

vi.mock("@/store/auth-store", () => ({
  useAuthStore: () => "mock-token",
}));

vi.mock("@/components/whatsapp/whatsapp-reminder-button", () => ({
  WhatsAppReminderButton: () => null,
}));

vi.mock("@/components/subscription/upgrade-prompt", () => ({
  UpgradePrompt: () => null,
}));

vi.mock("@/components/role-gate", () => ({
  RoleGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children}</div>,
  },
}));

import MembersPage from "@/app/(dashboard)/members/page";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("MembersPage Filters", () => {
  it("initializes status filter from URL search params", () => {
    renderWithProviders(<MembersPage />);
    const statusSelect = screen.getByLabelText("Filter by status") as HTMLSelectElement;
    expect(statusSelect.value).toBe("expired");
  });

  it("renders status filter dropdown with all options", () => {
    renderWithProviders(<MembersPage />);
    const statusSelect = screen.getByLabelText("Filter by status");
    expect(statusSelect).toBeInTheDocument();
    expect(screen.getByText("All Statuses")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText("Frozen")).toBeInTheDocument();
  });

  it("renders plan filter dropdown with configured plans", () => {
    renderWithProviders(<MembersPage />);
    const planSelect = screen.getByLabelText("Filter by plan");
    expect(planSelect).toBeInTheDocument();
    expect(screen.getByText("All Plans")).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText("Quarterly")).toBeInTheDocument();
  });

  it("shows Clear Filters button when a filter is active", () => {
    renderWithProviders(<MembersPage />);
    expect(screen.getByText("Clear Filters")).toBeInTheDocument();
  });
});
