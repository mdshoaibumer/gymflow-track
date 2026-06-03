import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

describe("useInstallPrompt", () => {
  let matchMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Default: not in standalone mode
    matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(display-mode: standalone)" ? false : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should start as not installable and not installed", () => {
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.isInstallable).toBe(false);
    expect(result.current.isInstalled).toBe(false);
  });

  it("should detect standalone mode as installed", () => {
    matchMediaMock.mockImplementation((query: string) => ({
      matches: query === "(display-mode: standalone)" ? true : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.isInstalled).toBe(true);
    expect(result.current.isInstallable).toBe(false);
  });

  it("should capture beforeinstallprompt event", () => {
    const { result } = renderHook(() => useInstallPrompt());

    // Simulate browser firing beforeinstallprompt
    const event = new Event("beforeinstallprompt");
    Object.defineProperty(event, "prompt", { value: vi.fn() });
    Object.defineProperty(event, "userChoice", {
      value: Promise.resolve({ outcome: "accepted" }),
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(result.current.isInstallable).toBe(true);
  });

  it("should call prompt and resolve on accepted", async () => {
    const { result } = renderHook(() => useInstallPrompt());

    const promptFn = vi.fn();
    const event = new Event("beforeinstallprompt");
    Object.defineProperty(event, "prompt", { value: promptFn });
    Object.defineProperty(event, "userChoice", {
      value: Promise.resolve({ outcome: "accepted" }),
    });

    act(() => {
      window.dispatchEvent(event);
    });

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(promptFn).toHaveBeenCalled();
    expect(accepted).toBe(true);
    expect(result.current.isInstallable).toBe(false);
  });

  it("should return false when user dismisses prompt", async () => {
    const { result } = renderHook(() => useInstallPrompt());

    const event = new Event("beforeinstallprompt");
    Object.defineProperty(event, "prompt", { value: vi.fn() });
    Object.defineProperty(event, "userChoice", {
      value: Promise.resolve({ outcome: "dismissed" }),
    });

    act(() => {
      window.dispatchEvent(event);
    });

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(accepted).toBe(false);
  });

  it("should return false when no prompt is available", async () => {
    const { result } = renderHook(() => useInstallPrompt());

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(accepted).toBe(false);
  });

  it("should handle appinstalled event", () => {
    const { result } = renderHook(() => useInstallPrompt());

    // First make it installable
    const event = new Event("beforeinstallprompt");
    Object.defineProperty(event, "prompt", { value: vi.fn() });
    Object.defineProperty(event, "userChoice", {
      value: Promise.resolve({ outcome: "accepted" }),
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(result.current.isInstallable).toBe(true);

    // Then trigger appinstalled
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(result.current.isInstalled).toBe(true);
    expect(result.current.isInstallable).toBe(false);
  });
});
