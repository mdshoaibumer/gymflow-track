import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChangePasswordPage from "@/app/(dashboard)/change-password/page";

// Mock auth service
const mockChangePassword = vi.fn();
vi.mock("@/services/auth.service", () => ({
  authService: {
    changePassword: (...args: unknown[]) => mockChangePassword(...args),
  },
}));

// Mock auth store
const mockLogout = vi.fn();
vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (s: { logout: () => void; user: { name: string; email: string } }) => unknown) =>
    selector({ logout: mockLogout, user: { name: "Test User", email: "test@gym.com" } }),
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, transition, ...rest } = props as Record<string, unknown>;
      return <div {...(rest as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>;
    },
  },
}));

// Mock sonner — use vi.hoisted to avoid hoisting issues
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: mockToast,
}));

describe("ChangePasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChangePassword.mockResolvedValue({ message: "Password changed successfully" });
  });

  it("renders the page title", () => {
    render(<ChangePasswordPage />);
    expect(screen.getByRole("heading", { name: "Change Password" })).toBeInTheDocument();
  });

  it("renders current password, new password, and confirm fields", () => {
    render(<ChangePasswordPage />);
    expect(screen.getByLabelText("Current Password")).toBeInTheDocument();
    expect(screen.getByLabelText("New Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm New Password")).toBeInTheDocument();
  });

  it("shows validation error for short new password", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage />);

    await user.type(screen.getByLabelText("Current Password"), "OldPass123");
    await user.type(screen.getByLabelText("New Password"), "short");
    await user.type(screen.getByLabelText("Confirm New Password"), "short");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    });
  });

  it("shows validation error for mismatched passwords", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage />);

    await user.type(screen.getByLabelText("Current Password"), "OldPass123");
    await user.type(screen.getByLabelText("New Password"), "NewSecure1Pass");
    await user.type(screen.getByLabelText("Confirm New Password"), "DifferentPass1");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    });
  });

  it("calls changePassword on valid submit", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage />);

    await user.type(screen.getByLabelText("Current Password"), "OldPass123");
    await user.type(screen.getByLabelText("New Password"), "NewSecure1Pass");
    await user.type(screen.getByLabelText("Confirm New Password"), "NewSecure1Pass");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith("OldPass123", "NewSecure1Pass");
    });
  });

  it("shows success toast on successful change", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage />);

    await user.type(screen.getByLabelText("Current Password"), "OldPass123");
    await user.type(screen.getByLabelText("New Password"), "NewSecure1Pass");
    await user.type(screen.getByLabelText("Confirm New Password"), "NewSecure1Pass");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Password changed successfully");
    });
  });

  it("shows error toast on failure", async () => {
    mockChangePassword.mockRejectedValueOnce(new Error("Current password is incorrect"));
    const user = userEvent.setup();
    render(<ChangePasswordPage />);

    await user.type(screen.getByLabelText("Current Password"), "WrongPass1");
    await user.type(screen.getByLabelText("New Password"), "NewSecure1Pass");
    await user.type(screen.getByLabelText("Confirm New Password"), "NewSecure1Pass");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Current password is incorrect");
    });
  });

  it("has password visibility toggle buttons", () => {
    render(<ChangePasswordPage />);
    // There should be toggle buttons (eye icons) for current and new password fields
    const toggleButtons = screen.getAllByRole("button").filter(
      (btn) => btn.getAttribute("tabindex") === "-1"
    );
    expect(toggleButtons.length).toBeGreaterThanOrEqual(2);
  });
});
