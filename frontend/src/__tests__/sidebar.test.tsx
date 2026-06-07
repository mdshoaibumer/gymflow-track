import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock dependencies before importing
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

vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (s: { role: string }) => unknown) =>
    selector({ role: "owner" }),
}));

vi.mock("@/hooks/use-billing", () => ({
  useFeatureLimits: () => ({
    data: null,
    isLoading: false,
  }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    aside: ({ children, className }: { children: React.ReactNode; className?: string }) => <aside className={className}>{children}</aside>,
    div: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { Sidebar } from "@/components/layout/sidebar";

describe("Sidebar", () => {
  it("renders the app logo", () => {
    render(<Sidebar />);
    // Desktop sidebar renders logo image with alt text
    const logo = screen.getByAltText("GymFlow Logo");
    expect(logo).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    render(<Sidebar />);
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Members").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Payments").length).toBeGreaterThan(0);
  });

  it("renders owner-only items for owner role", () => {
    render(<Sidebar />);
    expect(screen.getAllByText("Staff").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Billing").length).toBeGreaterThan(0);
  });

  it("renders dashboard link with correct href", () => {
    render(<Sidebar />);
    const dashboardLinks = screen.getAllByText("Dashboard");
    const link = dashboardLinks[0].closest("a");
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("renders equipment link", () => {
    render(<Sidebar />);
    expect(screen.getAllByText("Equipment").length).toBeGreaterThan(0);
  });

  it("renders settings link for owner", () => {
    render(<Sidebar />);
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
  });
});
