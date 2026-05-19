import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the header element", () => {
    render(<Header />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders mobile menu button with correct aria-label", () => {
    render(<Header />);
    expect(screen.getByLabelText("Open menu")).toBeInTheDocument();
  });

  it("renders user menu button", () => {
    render(<Header />);
    expect(screen.getByLabelText("User menu")).toBeInTheDocument();
  });

  it("renders user initials in avatar", () => {
    render(<Header />);
    expect(screen.getByText("JS")).toBeInTheDocument();
  });

  it("renders notification center", () => {
    render(<Header />);
    expect(screen.getByTestId("notification-center")).toBeInTheDocument();
  });

  it("renders theme toggle", () => {
    render(<Header />);
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("renders desktop search trigger", () => {
    render(<Header />);
    expect(screen.getByText("Search…")).toBeInTheDocument();
  });

  it("shows user info in dropdown when clicked", async () => {
    const user = userEvent.setup();
    render(<Header />);

    await user.click(screen.getByLabelText("User menu"));

    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("john@gym.com")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
  });

  it("shows logout option in dropdown", async () => {
    const user = userEvent.setup();
    render(<Header />);

    await user.click(screen.getByLabelText("User menu"));

    expect(screen.getByText("Logout")).toBeInTheDocument();
  });
});
