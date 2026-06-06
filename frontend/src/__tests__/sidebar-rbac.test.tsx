import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({
    sidebarOpen: false,
    setSidebarOpen: vi.fn(),
    toggleSidebar: vi.fn(),
    closeSidebar: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-billing", () => ({
  useFeatureLimits: () => ({
    data: null,
    isLoading: false,
  }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    aside: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <aside className={className}>{children}</aside>
    ),
    div: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Shared role mock — changes per describe block
let mockRole = "owner";

vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (s: { role: string }) => unknown) =>
    selector({ role: mockRole }),
}));

import { Sidebar } from "@/components/layout/sidebar";

describe("Sidebar RBAC - Owner role", () => {
  beforeAll(() => { mockRole = "owner"; });

  it("shows all navigation items for owner", () => {
    render(<Sidebar />);
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Members").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Payments").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expenses").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reports").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Staff").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Billing").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
  });
});

describe("Sidebar RBAC - Admin role", () => {
  beforeAll(() => { mockRole = "admin"; });

  it("shows admin-accessible items", () => {
    render(<Sidebar />);
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Members").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Payments").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expenses").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reports").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Staff").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
  });

  it("hides owner-only items from admin", () => {
    render(<Sidebar />);
    expect(screen.queryByText("Billing")).not.toBeInTheDocument();
  });
});

describe("Sidebar RBAC - Staff role", () => {
  beforeAll(() => { mockRole = "staff"; });

  it("shows operational items for staff", () => {
    render(<Sidebar />);
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Members").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reminders").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Equipment").length).toBeGreaterThan(0);
  });

  it("hides Payments from staff", () => {
    render(<Sidebar />);
    expect(screen.queryByText("Payments")).not.toBeInTheDocument();
  });

  it("hides Expenses from staff", () => {
    render(<Sidebar />);
    expect(screen.queryByText("Expenses")).not.toBeInTheDocument();
  });

  it("hides Reports from staff", () => {
    render(<Sidebar />);
    expect(screen.queryByText("Reports")).not.toBeInTheDocument();
  });

  it("hides Staff management from staff", () => {
    render(<Sidebar />);
    expect(screen.queryByText("Staff")).not.toBeInTheDocument();
  });

  it("hides Billing from staff", () => {
    render(<Sidebar />);
    expect(screen.queryByText("Billing")).not.toBeInTheDocument();
  });

  it("hides Settings from staff", () => {
    render(<Sidebar />);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("hides Setup Wizard from staff", () => {
    render(<Sidebar />);
    expect(screen.queryByText("Setup Wizard")).not.toBeInTheDocument();
  });
});
