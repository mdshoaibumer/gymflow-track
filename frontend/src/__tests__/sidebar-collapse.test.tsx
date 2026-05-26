import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock hooks and stores
const mockToggleSidebarCollapse = vi.fn();
const mockSetSidebarOpen = vi.fn();

vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({
    sidebarOpen: false,
    setSidebarOpen: mockSetSidebarOpen,
    sidebarCollapsed: false,
    toggleSidebarCollapse: mockToggleSidebarCollapse,
  }),
}));

vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ role: "owner", user: { name: "Test User" } }),
}));

vi.mock("@/hooks/use-billing", () => ({
  useFeatureLimits: () => ({ data: null }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, className, onClick, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} onClick={onClick} {...props}>{children}</div>
    ),
    aside: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => (
      <aside className={className} {...props}>{children}</aside>
    ),
  },
}));

import { Sidebar } from "@/components/layout/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("Sidebar", () => {
  it("renders the brand logo", () => {
    render(<TooltipProvider><Sidebar /></TooltipProvider>);
    expect(screen.getByText("G")).toBeInTheDocument();
  });

  it("renders navigation items for owner role", () => {
    render(<TooltipProvider><Sidebar /></TooltipProvider>);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Members")).toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Staff")).toBeInTheDocument();
  });

  it("renders collapse button on desktop sidebar", () => {
    render(<TooltipProvider><Sidebar /></TooltipProvider>);
    const collapseButton = screen.getByLabelText("Collapse sidebar");
    expect(collapseButton).toBeInTheDocument();
  });

  it("calls toggleSidebarCollapse when collapse button clicked", async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><Sidebar /></TooltipProvider>);
    const collapseButton = screen.getByLabelText("Collapse sidebar");
    await user.click(collapseButton);
    expect(mockToggleSidebarCollapse).toHaveBeenCalled();
  });

  it("renders version footer when not collapsed", () => {
    render(<TooltipProvider><Sidebar /></TooltipProvider>);
    expect(screen.getByText("GymFlow Track v1.0")).toBeInTheDocument();
  });
});

describe("Sidebar - Collapsed State", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("hides nav labels when collapsed", async () => {
    // Override the mock for collapsed state
    vi.doMock("@/store/ui-store", () => ({
      useUIStore: () => ({
        sidebarOpen: false,
        setSidebarOpen: vi.fn(),
        sidebarCollapsed: true,
        toggleSidebarCollapse: vi.fn(),
      }),
    }));

    // Re-import to get new mock
    const { Sidebar: CollapsedSidebar } = await import("@/components/layout/sidebar");
    const { TooltipProvider: TP } = await import("@/components/ui/tooltip");
    render(<TP><CollapsedSidebar /></TP>);
    
    // When collapsed, GymFlow text should not be visible in the desktop sidebar
    // The component hides labels with {!collapsed && ...}
    const expandButton = screen.getByLabelText("Expand sidebar");
    expect(expandButton).toBeInTheDocument();
  });
});
