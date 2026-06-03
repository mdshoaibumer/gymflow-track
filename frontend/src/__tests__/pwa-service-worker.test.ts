import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Service Worker (sw.js)", () => {
  const swPath = join(__dirname, "../../public/sw.js");
  let swContent: string;

  beforeEach(() => {
    swContent = readFileSync(swPath, "utf-8");
  });

  it("should exist and be non-empty", () => {
    expect(swContent.length).toBeGreaterThan(100);
  });

  it("should handle install event", () => {
    expect(swContent).toContain('self.addEventListener("install"');
  });

  it("should handle activate event", () => {
    expect(swContent).toContain('self.addEventListener("activate"');
  });

  it("should handle fetch event", () => {
    expect(swContent).toContain('self.addEventListener("fetch"');
  });

  it("should skip non-GET requests", () => {
    expect(swContent).toContain('request.method !== "GET"');
  });

  it("should not cache API routes", () => {
    expect(swContent).toContain('url.pathname.startsWith("/api/")');
  });

  it("should have offline fallback URL", () => {
    expect(swContent).toContain("/offline");
  });

  it("should use cache versioning", () => {
    expect(swContent).toMatch(/CACHE_NAME\s*=\s*"/);
  });

  it("should call skipWaiting on install", () => {
    expect(swContent).toContain("self.skipWaiting()");
  });

  it("should call clients.claim on activate", () => {
    expect(swContent).toContain("self.clients.claim()");
  });

  it("should clean old caches on activate", () => {
    expect(swContent).toContain("caches.delete(name)");
  });

  it("should handle SKIP_WAITING message", () => {
    expect(swContent).toContain("SKIP_WAITING");
    expect(swContent).toContain('self.addEventListener("message"');
  });

  it("should cache static assets (cache-first strategy)", () => {
    expect(swContent).toContain("/_next/static/");
    expect(swContent).toContain("/icons/");
  });

  it("should use network-first for HTML pages", () => {
    expect(swContent).toContain("text/html");
  });
});
