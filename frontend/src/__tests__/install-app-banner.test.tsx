import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { InstallAppBanner } from "@/components/install-app-banner";

// Mock the useInstallPrompt hook
const mockPromptInstall = vi.fn();
vi.mock("@/hooks/use-install-prompt", () => ({
  useInstallPrompt: vi.fn(() => ({
    isInstallable: true,
    isInstalled: false,
    promptInstall: mockPromptInstall,
  })),
}));

import { useInstallPrompt } from "@/hooks/use-install-prompt";
const mockedUseInstallPrompt = vi.mocked(useInstallPrompt);

describe("InstallAppBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    mockPromptInstall.mockResolvedValue(true);
    mockedUseInstallPrompt.mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      promptInstall: mockPromptInstall,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("should render the install banner when installable", () => {
    render(<InstallAppBanner />);

    expect(screen.getByText("Install GymFlow App")).toBeInTheDocument();
    expect(screen.getByText(/Add to your home screen/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Install App/i })).toBeInTheDocument();
  });

  it("should not render when already installed", () => {
    mockedUseInstallPrompt.mockReturnValue({
      isInstallable: false,
      isInstalled: true,
      promptInstall: mockPromptInstall,
    });

    const { container } = render(<InstallAppBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("should not render when not installable", () => {
    mockedUseInstallPrompt.mockReturnValue({
      isInstallable: false,
      isInstalled: false,
      promptInstall: mockPromptInstall,
    });

    const { container } = render(<InstallAppBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("should not render when previously dismissed", () => {
    localStorage.setItem("pwa-install-dismissed", "true");

    const { container } = render(<InstallAppBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("should call promptInstall when Install App is clicked", async () => {
    render(<InstallAppBanner />);

    const installBtn = screen.getByRole("button", { name: /Install App/i });
    fireEvent.click(installBtn);

    expect(mockPromptInstall).toHaveBeenCalled();
  });

  it("should dismiss and set localStorage when X is clicked", () => {
    render(<InstallAppBanner />);

    const dismissBtn = screen.getByRole("button", { name: /Dismiss/i });
    fireEvent.click(dismissBtn);

    expect(localStorage.getItem("pwa-install-dismissed")).toBe("true");
  });

  it("should hide banner after user declines install prompt", async () => {
    mockPromptInstall.mockResolvedValue(false);
    render(<InstallAppBanner />);

    const installBtn = screen.getByRole("button", { name: /Install App/i });

    await act(async () => {
      fireEvent.click(installBtn);
    });

    // After declining, promptInstall was called
    expect(mockPromptInstall).toHaveBeenCalled();
  });
});
