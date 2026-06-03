import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img data-testid="member-photo" {...props} alt={props.alt as string || "member"} />;
  },
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    span: ({ children, ...props }: Record<string, unknown>) => (
      <span {...props}>{children as React.ReactNode}</span>
    ),
    div: ({ children, ...props }: Record<string, unknown>) => (
      <div {...props}>{children as React.ReactNode}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock hooks
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAdminOrAbove: true, isAuthenticated: true, isLoading: false }),
}));

const mockMembersWithPhoto = [
  {
    id: "m1",
    name: "John Doe",
    phone: "9876543210",
    email: "john@test.com",
    photo_url: "https://cdn.example.com/photos/john.jpg",
    version: 3,
    membership_status: "active",
    plan_name: "Monthly",
    end_date: "2026-07-01",
    joined_date: "2026-01-01",
  },
];

const mockMembersWithoutPhoto = [
  {
    id: "m2",
    name: "Jane Smith",
    phone: "9876543211",
    email: "jane@test.com",
    photo_url: null,
    version: 0,
    membership_status: "expired",
    plan_name: "Quarterly",
    end_date: "2026-05-01",
    joined_date: "2025-06-01",
  },
];

const mockMembersMultiple = [...mockMembersWithPhoto, ...mockMembersWithoutPhoto];

let mockMembersData = { members: mockMembersMultiple, total: 2 };

vi.mock("@/hooks/use-members", () => ({
  useMembers: () => ({
    data: mockMembersData,
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
    currentMembers: 2,
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
  ],
}));

vi.mock("@/hooks/use-membership-plans", () => ({
  useMembershipPlans: () => ({
    data: [{ id: "1", name: "Monthly", duration_months: 1, amount: 1000 }],
    isLoading: false,
  }),
}));

vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({ sidebarCollapsed: false }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Suppress dialog/portal issues
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

describe("Members Mobile Cards — Photo Avatar", () => {
  it("renders member photo with cache-busting version query param", () => {
    mockMembersData = { members: mockMembersWithPhoto, total: 1 };
    renderWithProviders(<MembersPage />);

    const images = screen.getAllByTestId("member-photo");
    const johnImg = images.find(
      (img) => img.getAttribute("src")?.includes("john.jpg")
    );
    expect(johnImg).toBeDefined();
    expect(johnImg?.getAttribute("src")).toContain("?v=3");
  });

  it("renders fallback icon when member has no photo", () => {
    mockMembersData = { members: mockMembersWithoutPhoto, total: 1 };
    renderWithProviders(<MembersPage />);

    // Should NOT have any member photo images
    const images = screen.queryAllByTestId("member-photo");
    expect(images).toHaveLength(0);
  });

  it("renders member name in mobile card", () => {
    mockMembersData = { members: mockMembersMultiple, total: 2 };
    renderWithProviders(<MembersPage />);

    // Names appear in both desktop table and mobile cards — just verify present
    expect(screen.getAllByText("John Doe").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Jane Smith").length).toBeGreaterThanOrEqual(1);
  });

  it("renders member phone in mobile card", () => {
    mockMembersData = { members: mockMembersMultiple, total: 2 };
    renderWithProviders(<MembersPage />);

    expect(screen.getAllByText("9876543210").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("9876543211").length).toBeGreaterThanOrEqual(1);
  });

  it("links to member detail page", () => {
    mockMembersData = { members: mockMembersWithPhoto, total: 1 };
    renderWithProviders(<MembersPage />);

    const links = screen.getAllByRole("link");
    const memberLink = links.find(
      (link) => link.getAttribute("href") === "/members/m1"
    );
    expect(memberLink).toBeDefined();
  });

  it("applies version 0 when version is undefined", () => {
    const memberNoVersion = [
      {
        ...mockMembersWithPhoto[0],
        id: "m3",
        version: undefined,
        photo_url: "https://cdn.example.com/photos/noversion.jpg",
      },
    ];
    mockMembersData = { members: memberNoVersion, total: 1 };
    renderWithProviders(<MembersPage />);

    const images = screen.getAllByTestId("member-photo");
    const img = images.find(
      (el) => el.getAttribute("src")?.includes("noversion.jpg")
    );
    expect(img).toBeDefined();
    expect(img?.getAttribute("src")).toContain("?v=0");
  });
});
