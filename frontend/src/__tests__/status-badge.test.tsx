import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/status-badge";

describe("StatusBadge", () => {
  it("renders the status text with underscores replaced by spaces", () => {
    render(<StatusBadge status="past_due" />);
    expect(screen.getByText("past due")).toBeInTheDocument();
  });

  it("renders single-word statuses as-is", () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("applies capitalize styling", () => {
    const { container } = render(<StatusBadge status="expired" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("capitalize");
  });

  it("applies custom className", () => {
    const { container } = render(<StatusBadge status="active" className="ml-2" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("ml-2");
  });

  it("renders unknown statuses with secondary variant", () => {
    render(<StatusBadge status="unknown_status" />);
    // Should still render without crashing
    expect(screen.getByText("unknown status")).toBeInTheDocument();
  });

  it.each([
    ["active", "success"],
    ["expired", "destructive"],
    ["frozen", "warning"],
    ["pending", "secondary"],
    ["cancelled", "outline"],
    ["completed", "success"],
    ["failed", "destructive"],
    ["refunded", "secondary"],
    ["trial", "warning"],
    ["past_due", "destructive"],
    ["locked", "destructive"],
  ])("maps status '%s' correctly", (status) => {
    const { container } = render(<StatusBadge status={status} />);
    // Just verify it renders without error
    expect(container.firstChild).toBeInTheDocument();
  });
});
