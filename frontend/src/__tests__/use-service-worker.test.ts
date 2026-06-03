import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useServiceWorker } from "@/hooks/use-service-worker";

describe("useServiceWorker", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: {
        register: vi.fn().mockResolvedValue({
          installing: null,
          waiting: null,
          active: null,
          addEventListener: vi.fn(),
          update: vi.fn(),
        }),
        controller: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    // @ts-expect-error - restore NODE_ENV
    process.env.NODE_ENV = originalEnv;
  });

  it("should not register SW in development mode", () => {
    // NODE_ENV is 'test' in vitest which our hook also skips (it checks for 'development')
    // So we test the actual production check logic
    vi.stubEnv("NODE_ENV", "development");

    renderHook(() => useServiceWorker());

    expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
  });

  it("should not register if serviceWorker is not supported", () => {
    vi.stubGlobal("navigator", {});

    // Should not throw
    expect(() => renderHook(() => useServiceWorker())).not.toThrow();
  });

  it("should register SW with correct path and scope in production", async () => {
    // Simulate production environment
    vi.stubEnv("NODE_ENV", "production");

    renderHook(() => useServiceWorker());

    // Wait for the async registration
    await vi.waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith("/sw.js", {
        scope: "/",
      });
    });
  });

  it("should return a ref (initially null)", () => {
    const { result } = renderHook(() => useServiceWorker());
    expect(result.current.current).toBeNull();
  });
});
