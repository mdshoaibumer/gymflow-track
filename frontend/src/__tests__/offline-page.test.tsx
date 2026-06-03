import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import OfflinePage from "@/app/offline/page";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("Offline Page", () => {
  it("should render the offline message", () => {
    render(<OfflinePage />);

    expect(screen.getByText("You're Offline")).toBeInTheDocument();
    expect(
      screen.getByText(/lost your internet connection/)
    ).toBeInTheDocument();
  });

  it("should have a Try Again button", () => {
    render(<OfflinePage />);

    const btn = screen.getByRole("button", { name: /Try Again/i });
    expect(btn).toBeInTheDocument();
  });

  it("should have a link to dashboard", () => {
    render(<OfflinePage />);

    const link = screen.getByRole("link", { name: /Go to Dashboard/i });
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("should have the wifi-off icon", () => {
    render(<OfflinePage />);

    // SVG with path representing wifi-off
    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
