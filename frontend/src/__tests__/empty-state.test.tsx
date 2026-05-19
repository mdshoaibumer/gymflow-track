import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Package } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState icon={Package} title="No items" description="Add your first item to get started." />
    );

    expect(screen.getByText("No items")).toBeInTheDocument();
    expect(screen.getByText("Add your first item to get started.")).toBeInTheDocument();
  });

  it("renders the icon", () => {
    const { container } = render(
      <EmptyState icon={Package} title="Empty" description="Nothing here" />
    );

    // Lucide renders an SVG
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders action button when provided", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={Package}
        title="No items"
        description="Nothing yet"
        action={{ label: "Add Item", onClick }}
      />
    );

    expect(screen.getByRole("button", { name: "Add Item" })).toBeInTheDocument();
  });

  it("calls action onClick when button is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={Package}
        title="No items"
        description="Nothing yet"
        action={{ label: "Add Item", onClick }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add Item" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not render action button when not provided", () => {
    render(
      <EmptyState icon={Package} title="Empty" description="Nothing" />
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <EmptyState icon={Package} title="Empty" description="Nothing" className="my-custom-class" />
    );

    expect(container.firstChild).toHaveClass("my-custom-class");
  });
});
