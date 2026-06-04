import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttendancePage from "@/app/(dashboard)/attendance/page";

// Mock auth store
const mockUser = {
  id: "user-1",
  gym_id: "gym-123",
  email: "owner@gym.com",
  name: "Test Owner",
  role: "owner",
};

vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      isAuthenticated: true,
      isLoading: false,
      user: mockUser,
      role: "owner",
      token: "session",
      isOwner: true,
      isAdminOrAbove: true,
      isSuperAdmin: false,
    }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

// Mock attendance hooks
vi.mock("@/hooks/use-attendance", () => ({
  useAttendanceToday: () => ({
    data: { attendance: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAttendanceStats: () => ({
    data: { checked_in_today: 5, currently_in_gym: 3, total_this_week: 20 },
  }),
  useCheckInManual: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCheckOut: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Mock members hook
vi.mock("@/hooks/use-members", () => ({
  useMembers: () => ({ data: { members: [] } }),
}));

// Mock subscription feature gate — render children directly
vi.mock("@/components/subscription/feature-gate", () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...(props as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
    ),
  },
}));

// Mock fetch for QR data
const mockQRData = {
  gym_name: "Test Gym",
  code: "ABC123",
  whatsapp_url: "https://wa.me/919876543210?text=CHECKIN%20ABC123",
  refresh_in_seconds: 30,
  message: "Scan to check in",
};

describe("AttendanceQRDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Generate QR button on the attendance page", () => {
    render(<AttendancePage />);
    expect(
      screen.getByRole("button", { name: /generate qr/i })
    ).toBeInTheDocument();
  });

  it("opens the QR dialog when Generate QR is clicked", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockQRData,
    });

    render(<AttendancePage />);

    await user.click(screen.getByRole("button", { name: /generate qr/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Attendance QR Code")
      ).toBeInTheDocument();
    });
  });

  it("fetches and displays QR data when dialog opens", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockQRData,
    });

    render(<AttendancePage />);

    await user.click(screen.getByRole("button", { name: /generate qr/i }));

    await waitFor(() => {
      expect(screen.getByText("ABC123")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/gym-display/gym-123/qr-data")
    );
  });

  it("shows the check-in instruction text", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockQRData,
    });

    render(<AttendancePage />);

    await user.click(screen.getByRole("button", { name: /generate qr/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/members scan this qr to check in/i)
      ).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      statusText: "Not Found",
    });

    render(<AttendancePage />);

    await user.click(screen.getByRole("button", { name: /generate qr/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/failed to fetch qr data/i)
      ).toBeInTheDocument();
    });
  });

  it("shows retry button on error", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      statusText: "Server Error",
    });

    render(<AttendancePage />);

    await user.click(screen.getByRole("button", { name: /generate qr/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /retry/i })
      ).toBeInTheDocument();
    });
  });

  it("shows countdown timer for code refresh", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockQRData,
    });

    render(<AttendancePage />);

    await user.click(screen.getByRole("button", { name: /generate qr/i }));

    await waitFor(() => {
      expect(screen.getByText(/code refreshes in/i)).toBeInTheDocument();
    });
  });

  it("shows link to full-screen gym display", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockQRData,
    });

    render(<AttendancePage />);

    await user.click(screen.getByRole("button", { name: /generate qr/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/\/gym-display\?gymId=gym-123/)
      ).toBeInTheDocument();
    });
  });

  it("fetches a new QR code when the countdown timer reaches zero", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const updatedQRData = {
      ...mockQRData,
      code: "XYZ789",
      refresh_in_seconds: 30,
    };

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockQRData, refresh_in_seconds: 3 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => updatedQRData,
      });

    render(<AttendancePage />);

    await user.click(screen.getByRole("button", { name: /generate qr/i }));

    // Wait for initial fetch to display the first code
    await waitFor(() => {
      expect(screen.getByText("ABC123")).toBeInTheDocument();
    });

    // First fetch happened on dialog open
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Advance timer by 3 seconds (the refresh_in_seconds returned by server)
    // The timer fires every 1s and calls fetchQRData when timeLeft reaches 0
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // Timer should have triggered a new fetch when it hit 0
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    // The new code should be displayed
    await waitFor(() => {
      expect(screen.getByText("XYZ789")).toBeInTheDocument();
    });

    vi.useRealTimers();
  });
});
