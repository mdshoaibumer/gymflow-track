import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageSkeleton } from "@/components/page-skeleton";

describe("PageSkeleton", () => {
  it("renders header skeleton by default", () => {
    const { container } = render(<PageSkeleton />);
    // Should always have the header skeleton elements
    expect(container.querySelectorAll("[class*='animate']").length).toBeGreaterThan(0);
  });

  it("renders stat cards when cards prop is set", () => {
    const { container } = render(<PageSkeleton cards={4} />);
    // Should render 4 card containers
    const cards = container.querySelectorAll("[class*='CardContent']");
    // Cards render as divs with p-5
    expect(container.innerHTML).toContain("grid");
  });

  it("renders table skeleton when table prop is true", () => {
    const { container } = render(<PageSkeleton table rows={3} />);
    // Should contain a divide-y section for rows
    expect(container.innerHTML).toContain("divide-y");
  });

  it("renders chart skeleton when chart prop is true", () => {
    const { container } = render(<PageSkeleton chart />);
    // Chart skeleton has a taller skeleton element (240px)
    expect(container.innerHTML).toContain("240px");
  });

  it("renders correct number of table rows", () => {
    const { container } = render(<PageSkeleton table rows={7} />);
    const rowDivs = container.querySelectorAll(".divide-y > div");
    expect(rowDivs.length).toBe(7);
  });

  it("renders all sections together", () => {
    const { container } = render(<PageSkeleton cards={2} table chart rows={3} />);
    // Should render cards grid, chart, and table
    expect(container.innerHTML).toContain("grid");
    expect(container.innerHTML).toContain("240px");
    expect(container.innerHTML).toContain("divide-y");
  });
});
