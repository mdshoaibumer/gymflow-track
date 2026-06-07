import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Icon.png Usage - No logo.png references", () => {
  const srcDir = resolve(__dirname, "..");

  const filesToCheck = [
    "components/layout/header.tsx",
    "components/layout/sidebar.tsx",
    "app/(auth)/login/page.tsx",
    "app/(auth)/register/page.tsx",
    "app/(auth)/forgot-password/page.tsx",
    "app/(auth)/reset-password/page.tsx",
    "app/(admin)/layout.tsx",
    "app/page.tsx",
  ];

  filesToCheck.forEach((file) => {
    it(`${file} uses /icon.png instead of /logo.png`, () => {
      const content = readFileSync(resolve(srcDir, file), "utf-8");
      expect(content).not.toContain('"/logo.png"');
      expect(content).not.toContain("'/logo.png'");
      // Should contain icon.png reference
      expect(content).toContain("/icon.png");
    });
  });
});
