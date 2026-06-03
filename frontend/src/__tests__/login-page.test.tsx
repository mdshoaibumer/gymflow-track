import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/(auth)/login/page";

// Mock auth service
vi.mock("@/services/auth.service", () => ({
  authService: {
    login: vi.fn(),
    getMe: vi.fn(),
  },
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the useAuth hook (prevents /auth/me call during test)
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
  }),
}));

import { authService } from "@/services/auth.service";
import { toast } from "sonner";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the login form with all required fields", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Password", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in|log in/i })).toBeInTheDocument();
  });

  it("shows validation errors for empty submission", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: /sign in|log in/i }));

    await waitFor(() => {
      // Zod validation triggers client-side
      expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument();
    });
  });

  it("shows validation error for invalid email", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "notanemail");
    await user.type(screen.getByLabelText("Password", { exact: true }), "password");
    await user.click(screen.getByRole("button", { name: /sign in|log in/i }));

    await waitFor(() => {
      expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument();
    });
  });

  it("calls login service with form data on valid submission", async () => {
    const user = userEvent.setup();
    const mockLogin = vi.mocked(authService.login);
    const mockGetMe = vi.mocked(authService.getMe);

    mockLogin.mockResolvedValue({
      access_token: "test-access",
      refresh_token: "test-refresh",
      token_type: "bearer",
    });
    mockGetMe.mockResolvedValue({
      id: "user-1",
      gym_id: "gym-1",
      name: "Owner",
      email: "owner@gym.com",
      phone: "9876543210",
      role: "owner",
      is_active: true,
    });

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "owner@gym.com");
    await user.type(screen.getByLabelText("Password", { exact: true }), "ValidPass1");
    await user.click(screen.getByRole("button", { name: /sign in|log in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: "owner@gym.com",
        password: "ValidPass1",
        remember_me: false,
      });
    });
  });

  it("displays server error on login failure", async () => {
    const user = userEvent.setup();
    const mockLogin = vi.mocked(authService.login);
    mockLogin.mockRejectedValue(new Error("Invalid email or password"));

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "owner@gym.com");
    await user.type(screen.getByLabelText("Password", { exact: true }), "WrongPass1");
    await user.click(screen.getByRole("button", { name: /sign in|log in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password");
    });
  });

  it("shows error toast on login failure", async () => {
    const user = userEvent.setup();
    vi.mocked(authService.login).mockRejectedValue(new Error("Invalid email or password"));

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "owner@gym.com");
    await user.type(screen.getByLabelText("Password", { exact: true }), "WrongPass1");
    await user.click(screen.getByRole("button", { name: /sign in|log in/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Invalid email or password");
    });
  });

  it("disables submit button while submitting", async () => {
    const user = userEvent.setup();
    // Make login hang (never resolve) to test loading state
    vi.mocked(authService.login).mockReturnValue(new Promise(() => {}));

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "owner@gym.com");
    await user.type(screen.getByLabelText("Password", { exact: true }), "ValidPass1");
    await user.click(screen.getByRole("button", { name: /sign in|log in/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /signing|loading/i })).toBeDisabled();
    });
  });

  it("has a link to forgot password page", () => {
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: /forgot/i })).toHaveAttribute("href", "/forgot-password");
  });

  it("has a link to register page", () => {
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: /register|sign up|create/i })).toBeInTheDocument();
  });
});
