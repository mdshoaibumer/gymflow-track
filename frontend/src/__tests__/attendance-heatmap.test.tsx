import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttendanceHeatmap } from "@/components/members/attendance-heatmap";

describe("AttendanceHeatmap", () => {
  it("renders empty state when no attendance data", () => {
    render(<AttendanceHeatmap attendance={[]} />);
    expect(screen.getByText("No attendance data to display")).toBeInTheDocument();
  });

  it("renders heatmap grid with attendance data", () => {
    const attendance = [
      { check_in_at: new Date().toISOString() },
      { check_in_at: new Date().toISOString() },
      { check_in_at: new Date(Date.now() - 86400000).toISOString() }, // yesterday
    ];

    const { container } = render(<AttendanceHeatmap attendance={attendance} weeks={4} />);

    // Should render the header
    expect(screen.getByText("Visit History (4 weeks)")).toBeInTheDocument();

    // Should render legend
    expect(screen.getByText("Less")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();

    // Should render grid cells (4 weeks * 7 days = 28 cells)
    const cells = container.querySelectorAll(".heatmap-cell");
    expect(cells.length).toBe(28);
  });

  it("renders correct number of cells for 8 weeks (default)", () => {
    const attendance = [{ check_in_at: new Date().toISOString() }];

    const { container } = render(<AttendanceHeatmap attendance={attendance} />);

    // Default 8 weeks = 56 cells
    const cells = container.querySelectorAll(".heatmap-cell");
    expect(cells.length).toBe(56);
  });

  it("highlights cells with visits", () => {
    const today = new Date();
    const attendance = [
      { check_in_at: today.toISOString() },
      { check_in_at: today.toISOString() },
      { check_in_at: today.toISOString() },
    ];

    const { container } = render(<AttendanceHeatmap attendance={attendance} weeks={2} />);

    // At least one cell should have an emerald class (indicating visits)
    const activeCells = container.querySelectorAll('[class*="emerald"]');
    expect(activeCells.length).toBeGreaterThan(0);
  });

  it("cells have title attribute with date and visit count", () => {
    const today = new Date();
    const attendance = [{ check_in_at: today.toISOString() }];

    const { container } = render(<AttendanceHeatmap attendance={attendance} weeks={1} />);

    const cells = container.querySelectorAll(".heatmap-cell");
    // Every cell should have a title
    cells.forEach((cell) => {
      expect(cell.getAttribute("title")).toBeTruthy();
      expect(cell.getAttribute("title")).toContain("visit");
    });
  });

  it("handles multiple visits on the same day", () => {
    const today = new Date();
    const attendance = [
      { check_in_at: today.toISOString() },
      { check_in_at: today.toISOString() },
      { check_in_at: today.toISOString() },
      { check_in_at: today.toISOString() },
      { check_in_at: today.toISOString() },
    ];

    const { container } = render(<AttendanceHeatmap attendance={attendance} weeks={1} />);

    // Should have highest intensity cell
    const highIntensityCells = container.querySelectorAll('[class*="emerald-600"], [class*="emerald-400"]');
    expect(highIntensityCells.length).toBeGreaterThan(0);
  });
});
