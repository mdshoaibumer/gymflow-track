import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock hooks
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
    user: { name: "Test", email: "test@gym.com" },
    role: "owner",
    isAdminOrAbove: true,
  }),
}));

vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({
    sidebarOpen: false,
    setSidebarOpen: vi.fn(),
    sidebarCollapsed: false,
    toggleSidebarCollapse: vi.fn(),
    toggleSidebar: vi.fn(),
  }),
}));

vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ role: "owner", user: { name: "Test", email: "test@gym.com" } }),
}));

vi.mock("@/hooks/use-billing", () => ({
  useFeatureLimits: () => ({ data: null }),
}));

vi.mock("@/services/auth.service", () => ({
  authService: { logout: vi.fn() },
}));

vi.mock("@/lib/api", () => ({
  onAuthExpired: () => () => {},
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  LayoutGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...props}>{children}</div>
    ),
    aside: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => (
      <aside className={className} {...props}>{children}</aside>
    ),
  },
  useInView: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useSpring: () => ({ get: () => 0 }),
}));

// Mock child components that aren't under test
vi.mock("@/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/feedback-widget", () => ({
  FeedbackWidget: () => null,
}));
vi.mock("@/components/billing-banner", () => ({
  BillingBanner: () => null,
}));
vi.mock("@/components/command-palette", () => ({
  CommandPalette: () => null,
}));
vi.mock("@/components/breadcrumbs", () => ({
  Breadcrumbs: () => null,
}));
vi.mock("@/components/notification-center", () => ({
  NotificationCenter: () => null,
}));
vi.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

import DashboardLayout from "@/app/(dashboard)/layout";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("Accessibility - Dashboard Layout", () => {
  it("has a skip-to-content link", () => {
    const { container } = renderWithProviders(
      <DashboardLayout>
        <p>Content</p>
      </DashboardLayout>
    );
    const skipLink = container.querySelector('a[href="#main-content"]');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveTextContent("Skip to main content");
  });

  it("has main content landmark with id", () => {
    const { container } = renderWithProviders(
      <DashboardLayout>
        <p>Content</p>
      </DashboardLayout>
    );
    const main = container.querySelector("main#main-content");
    expect(main).toBeInTheDocument();
  });

  it("skip link becomes visible on focus", () => {
    const { container } = renderWithProviders(
      <DashboardLayout>
        <p>Content</p>
      </DashboardLayout>
    );
    const skipLink = container.querySelector('a[href="#main-content"]');
    // Check it has sr-only class (hidden by default)
    expect(skipLink?.className).toContain("sr-only");
    // Check it has focus:not-sr-only (visible on focus)
    expect(skipLink?.className).toContain("focus:not-sr-only");
  });

  it("sidebar has navigation landmark", () => {
    const { container } = renderWithProviders(
      <DashboardLayout>
        <p>Content</p>
      </DashboardLayout>
    );
    const nav = container.querySelector("nav");
    expect(nav).toBeInTheDocument();
  });

  it("renders page content inside main", () => {
    renderWithProviders(
      <DashboardLayout>
        <p>Test Content Here</p>
      </DashboardLayout>
    );
    const main = document.getElementById("main-content");
    expect(main).toBeInTheDocument();
    expect(main?.textContent).toContain("Test Content Here");
  });
});
