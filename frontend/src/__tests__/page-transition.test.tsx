import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageTransition } from "@/components/page-transition";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} data-testid="page-transition" {...props}>
        {children}
      </div>
    ),
  },
}));

describe("PageTransition", () => {
  it("renders children", () => {
    render(
      <PageTransition>
        <h1>Dashboard</h1>
      </PageTransition>
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("wraps content with motion div", () => {
    render(
      <PageTransition>
        <p>Content</p>
      </PageTransition>
    );
    expect(screen.getByTestId("page-transition")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <PageTransition className="my-transition">
        <p>Content</p>
      </PageTransition>
    );
    expect(screen.getByTestId("page-transition")).toHaveClass("my-transition");
  });
});
