import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";

// Mock dependencies
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    role: "owner",
    user: { name: "John Smith", email: "john@gym.com" },
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({
    toggleSidebar: vi.fn(),
  }),
}));

vi.mock("@/services/auth.service", () => ({
  authService: {
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/components/notification-center", () => ({
  NotificationCenter: () => <div data-testid="notification-center" />,
}));

vi.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

function renderHeader() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Header />
    </QueryClientProvider>
  );
}

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the header element", () => {
    renderHeader();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders mobile menu button with correct aria-label", () => {
    renderHeader();
    expect(screen.getByLabelText("Open menu")).toBeInTheDocument();
  });

  it("renders user menu button", () => {
    renderHeader();
    expect(screen.getByLabelText("User menu")).toBeInTheDocument();
  });

  it("renders user initials in avatar", () => {
    renderHeader();
    expect(screen.getByText("JS")).toBeInTheDocument();
  });

  it("renders notification center", () => {
    renderHeader();
    expect(screen.getByTestId("notification-center")).toBeInTheDocument();
  });

  it("renders theme toggle", () => {
    renderHeader();
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("renders desktop search trigger", () => {
    renderHeader();
    expect(screen.getByText("Search anything…")).toBeInTheDocument();
  });

  it("shows user info in dropdown when clicked", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByLabelText("User menu"));

    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("john@gym.com")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
  });

  it("shows logout option in dropdown", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByLabelText("User menu"));

    expect(screen.getByText("Logout")).toBeInTheDocument();
  });
});
