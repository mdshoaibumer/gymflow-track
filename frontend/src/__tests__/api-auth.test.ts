import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

// We test the API module's auth-expired event logic in isolation
describe("API Auth Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("AUTH_EXPIRED_EVENT", () => {
    it("dispatches auth-expired event on window", () => {
      const handler = vi.fn();
      window.addEventListener("gymflow:auth-expired", handler);

      window.dispatchEvent(new Event("gymflow:auth-expired"));

      expect(handler).toHaveBeenCalledOnce();
      window.removeEventListener("gymflow:auth-expired", handler);
    });
  });

  describe("API URL configuration", () => {
    it("defaults to localhost:8000 when env var is not set", async () => {
      // Dynamic import to get fresh module
      const { API_URL } = await import("@/lib/api");
      expect(API_URL).toContain("localhost:8000");
    });
  });

  describe("Token constants", () => {
    it("defines correct localStorage keys for legacy cleanup", async () => {
      const { TOKEN_KEY, REFRESH_KEY } = await import("@/lib/api");
      expect(TOKEN_KEY).toBe("gymflow_access_token");
      expect(REFRESH_KEY).toBe("gymflow_refresh_token");
    });
  });

  describe("onAuthExpired helper", () => {
    it("registers and unregisters event listener", async () => {
      const { onAuthExpired } = await import("@/lib/api");
      const callback = vi.fn();

      const unsubscribe = onAuthExpired(callback);

      window.dispatchEvent(new Event("gymflow:auth-expired"));
      expect(callback).toHaveBeenCalledOnce();

      unsubscribe();
      window.dispatchEvent(new Event("gymflow:auth-expired"));
      expect(callback).toHaveBeenCalledOnce(); // Still 1, not 2
    });
  });
});
