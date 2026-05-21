import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScrollReveal, StaggerContainer, staggerItemVariants } from "@/components/scroll-reveal";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} data-testid="motion-div" {...props}>
        {children}
      </div>
    ),
  },
  useInView: () => true,
}));

describe("ScrollReveal", () => {
  it("renders children", () => {
    render(
      <ScrollReveal>
        <p>Hello World</p>
      </ScrollReveal>
    );
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <ScrollReveal className="my-class">
        <p>Content</p>
      </ScrollReveal>
    );
    expect(screen.getByTestId("motion-div")).toHaveClass("my-class");
  });

  it("renders with different directions without error", () => {
    const directions = ["up", "down", "left", "right"] as const;
    directions.forEach((direction) => {
      const { unmount } = render(
        <ScrollReveal direction={direction}>
          <span>{direction}</span>
        </ScrollReveal>
      );
      expect(screen.getByText(direction)).toBeInTheDocument();
      unmount();
    });
  });
});

describe("StaggerContainer", () => {
  it("renders children", () => {
    render(
      <StaggerContainer>
        <p>Child 1</p>
        <p>Child 2</p>
      </StaggerContainer>
    );
    expect(screen.getByText("Child 1")).toBeInTheDocument();
    expect(screen.getByText("Child 2")).toBeInTheDocument();
  });

  it("applies className", () => {
    render(
      <StaggerContainer className="grid gap-4">
        <p>Item</p>
      </StaggerContainer>
    );
    expect(screen.getByTestId("motion-div")).toHaveClass("grid");
    expect(screen.getByTestId("motion-div")).toHaveClass("gap-4");
  });
});

describe("staggerItemVariants", () => {
  it("has hidden and show states", () => {
    expect(staggerItemVariants).toHaveProperty("hidden");
    expect(staggerItemVariants).toHaveProperty("show");
  });

  it("hidden state has opacity 0 and y offset", () => {
    expect(staggerItemVariants.hidden).toEqual({ opacity: 0, y: 16 });
  });

  it("show state has opacity 1 and y 0", () => {
    expect(staggerItemVariants.show).toMatchObject({ opacity: 1, y: 0 });
  });
});
