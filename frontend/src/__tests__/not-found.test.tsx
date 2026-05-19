import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GlobalNotFound from "@/app/not-found";

describe("NotFoundPage (404)", () => {
  it("renders the 404 heading", () => {
    render(<GlobalNotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders a descriptive message", () => {
    render(<GlobalNotFound />);
    expect(
      screen.getByText(/page you.*looking for doesn.*exist/i)
    ).toBeInTheDocument();
  });

  it("renders a Go Home link", () => {
    render(<GlobalNotFound />);
    const link = screen.getByRole("link", { name: /go home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders an icon", () => {
    const { container } = render(<GlobalNotFound />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
