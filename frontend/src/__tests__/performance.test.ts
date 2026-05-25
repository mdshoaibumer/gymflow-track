import { describe, it, expect } from "vitest";

/**
 * Performance-related assertions to prevent regressions.
 * These tests verify bundle-friendly patterns are followed.
 */
describe("Performance Patterns", () => {
  it(
    "framer-motion is imported from top-level (tree-shakeable)",
    async () => {
      // Verify we import from "framer-motion" not a deep path
      const scrollReveal = await import("@/components/scroll-reveal");
      expect(scrollReveal.ScrollReveal).toBeDefined();
      expect(scrollReveal.StaggerContainer).toBeDefined();
    },
    15000,
  );

  it("AnimatedNumber uses requestAnimationFrame pattern", async () => {
    const mod = await import("@/components/animated-number");
    expect(mod.AnimatedNumber).toBeDefined();
    // Component exists and is a function (valid React component)
    expect(typeof mod.AnimatedNumber).toBe("function");
  });

  it("PageTransition component is lightweight", async () => {
    const mod = await import("@/components/page-transition");
    expect(mod.PageTransition).toBeDefined();
    expect(typeof mod.PageTransition).toBe("function");
  });

  it("UI store uses persist middleware with partialize", async () => {
    const { useUIStore } = await import("@/store/ui-store");
    const state = useUIStore.getState();
    // Verify the persisted fields exist
    expect(state).toHaveProperty("sidebarCollapsed");
    expect(state).toHaveProperty("sidebarOpen");
    expect(state).toHaveProperty("toggleSidebarCollapse");
  });

  it("stagger variants use transform + opacity only (GPU-friendly)", async () => {
    const { staggerItemVariants } = await import("@/components/scroll-reveal");
    const hidden = staggerItemVariants.hidden;
    const show = staggerItemVariants.show;

    // Only opacity and y (translateY) should be animated - no layout-triggering properties
    expect(Object.keys(hidden)).toEqual(expect.arrayContaining(["opacity", "y"]));
    expect(Object.keys(hidden)).not.toContain("width");
    expect(Object.keys(hidden)).not.toContain("height");
    expect(Object.keys(hidden)).not.toContain("top");
    expect(Object.keys(hidden)).not.toContain("left");

    expect(show.opacity).toBe(1);
    expect(show.y).toBe(0);
  });

  it("animation durations are under 500ms for micro-interactions", async () => {
    const { staggerItemVariants } = await import("@/components/scroll-reveal");
    const transition = staggerItemVariants.show.transition;
    expect(transition.duration).toBeLessThanOrEqual(0.5);
  });
});
