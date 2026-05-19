import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumbs } from "@/components/breadcrumbs";

// Mock usePathname from next/navigation (already mocked in setup.ts, override per test)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: vi.fn(),
  useSearchParams: () => new URLSearchParams(),
}));

import { usePathname } from "next/navigation";
const mockUsePathname = vi.mocked(usePathname);

describe("Breadcrumbs", () => {
  it("returns null for single-segment paths (e.g. /dashboard)", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    const { container } = render(<Breadcrumbs />);
    expect(container.innerHTML).toBe("");
  });

  it("renders breadcrumbs for multi-segment paths", () => {
    mockUsePathname.mockReturnValue("/members/123");
    render(<Breadcrumbs />);

    expect(screen.getByLabelText("Breadcrumb")).toBeInTheDocument();
    expect(screen.getByText("Members")).toBeInTheDocument();
  });

  it("renders the last segment with overrideLastLabel", () => {
    mockUsePathname.mockReturnValue("/members/456");
    render(<Breadcrumbs overrideLastLabel="John Doe" />);

    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("renders a Home link", () => {
    mockUsePathname.mockReturnValue("/members/new");
    render(<Breadcrumbs />);

    expect(screen.getByLabelText("Home")).toBeInTheDocument();
    expect(screen.getByLabelText("Home").closest("a")).toHaveAttribute("href", "/dashboard");
  });

  it("strips (dashboard) group from path segments", () => {
    mockUsePathname.mockReturnValue("/members/manage");
    render(<Breadcrumbs />);

    // Should not render "(dashboard)" as a crumb
    expect(screen.queryByText("(dashboard)")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    mockUsePathname.mockReturnValue("/members/new");
    render(<Breadcrumbs className="my-class" />);

    expect(screen.getByLabelText("Breadcrumb")).toHaveClass("my-class");
  });
});
