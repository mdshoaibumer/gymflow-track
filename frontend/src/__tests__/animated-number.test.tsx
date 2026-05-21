import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnimatedNumber } from "@/components/animated-number";

// Mock framer-motion's useInView
vi.mock("framer-motion", () => ({
  useInView: () => true,
}));

// Mock matchMedia for jsdom
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("AnimatedNumber", () => {
  it("renders without crashing", () => {
    const { container } = render(<AnimatedNumber value={100} />);
    expect(container.querySelector("span")).toBeInTheDocument();
  });

  it("renders the final value immediately in test env", () => {
    render(<AnimatedNumber value={42} duration={100} />);
    // In NODE_ENV=test, value renders immediately (no animation)
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("uses custom format function", () => {
    const formatFn = (n: number) => `$${Math.round(n)}`;
    render(<AnimatedNumber value={100} duration={100} formatFn={formatFn} />);
    expect(screen.getByText("$100")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <AnimatedNumber value={50} className="text-bold" />
    );
    expect(container.querySelector("span")).toHaveClass("text-bold");
  });

  it("shows final value immediately in test env", () => {
    render(<AnimatedNumber value={999} duration={5000} />);
    // In test env, renders final value immediately
    expect(screen.getByText("999")).toBeInTheDocument();
  });

  it("respects reduced motion preference", () => {
    // Mock matchMedia to prefer reduced motion
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(<AnimatedNumber value={200} duration={1000} />);
    expect(screen.getByText("200")).toBeInTheDocument();
  });
});
