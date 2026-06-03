import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("PWA Manifest", () => {
  const manifestPath = join(__dirname, "../../public/manifest.json");
  let manifest: Record<string, unknown>;

  it("should be valid JSON", () => {
    const content = readFileSync(manifestPath, "utf-8");
    expect(() => JSON.parse(content)).not.toThrow();
    manifest = JSON.parse(content);
  });

  it("should have required fields", () => {
    const content = readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(content);

    expect(manifest.name).toBe("GymFlow Track");
    expect(manifest.short_name).toBe("GymFlow");
    expect(manifest.start_url).toBe("/dashboard");
    expect(manifest.display).toBe("standalone");
    expect(manifest.background_color).toBeDefined();
    expect(manifest.theme_color).toBeDefined();
  });

  it("should have at least one icon", () => {
    const content = readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(content);

    const icons = manifest.icons as Array<{ src: string; sizes: string }>;
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  it("should have a maskable icon for Android adaptive icons", () => {
    const content = readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(content);

    const icons = manifest.icons as Array<{ purpose?: string }>;
    const hasMaskable = icons.some((icon) => icon.purpose === "maskable");
    expect(hasMaskable).toBe(true);
  });

  it("should have icons of at least 192px and 512px", () => {
    const content = readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(content);

    const icons = manifest.icons as Array<{ sizes: string }>;
    const sizes = icons.map((i) => i.sizes);
    // Either has specific sizes or "any" for SVG
    expect(
      sizes.includes("192x192") || sizes.includes("any")
    ).toBe(true);
    expect(
      sizes.includes("512x512") || sizes.includes("any")
    ).toBe(true);
  });

  it("should have standalone display mode", () => {
    const content = readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(content);

    expect(manifest.display).toBe("standalone");
  });

  it("should not prefer related applications (no Play Store redirect)", () => {
    const content = readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(content);

    expect(manifest.prefer_related_applications).toBe(false);
  });

  it("should have valid theme color (hex format)", () => {
    const content = readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(content);

    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
