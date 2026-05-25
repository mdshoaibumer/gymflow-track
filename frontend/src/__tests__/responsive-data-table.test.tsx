import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
} from "@tanstack/react-table";
import { ResponsiveDataTable } from "@/components/responsive-data-table";

interface TestRow {
  id: string;
  name: string;
  email: string;
}

const testData: TestRow[] = [
  { id: "1", name: "Alice", email: "alice@test.com" },
  { id: "2", name: "Bob", email: "bob@test.com" },
];

const columns: ColumnDef<TestRow>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
];

function TestWrapper({
  data = testData,
  renderMobileCard,
  isLoading = false,
}: {
  data?: TestRow[];
  renderMobileCard?: (row: TestRow, index: number) => React.ReactNode;
  isLoading?: boolean;
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <ResponsiveDataTable
      table={table}
      columns={columns}
      renderMobileCard={renderMobileCard}
      caption="Test table"
      isLoading={isLoading}
    />
  );
}

describe("ResponsiveDataTable", () => {
  it("renders a table with headers", () => {
    render(<TestWrapper />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("renders row data", () => {
    render(<TestWrapper />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
  });

  it("renders caption for accessibility", () => {
    const { container } = render(<TestWrapper />);

    const caption = container.querySelector("caption");
    expect(caption).toBeInTheDocument();
    expect(caption?.textContent).toBe("Test table");
  });

  it("renders loading skeletons when isLoading", () => {
    const { container } = render(<TestWrapper isLoading />);

    const shimmerElements = container.querySelectorAll("[class*='animate-shimmer']");
    expect(shimmerElements.length).toBeGreaterThan(0);
  });

  it("renders mobile cards when renderMobileCard is provided", () => {
    render(
      <TestWrapper
        renderMobileCard={(row) => (
          <div key={row.id} data-testid={`mobile-card-${row.id}`}>
            {row.name}
          </div>
        )}
      />
    );

    expect(screen.getByTestId("mobile-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-card-2")).toBeInTheDocument();
  });

  it("hides desktop table on mobile when mobile cards are provided", () => {
    const { container } = render(
      <TestWrapper
        renderMobileCard={(row) => <div key={row.id}>{row.name}</div>}
      />
    );

    // Desktop table container should have "hidden md:block" classes
    const tableContainer = container.querySelector("[class*='hidden'][class*='md:block']");
    expect(tableContainer).toBeInTheDocument();
  });

  it("renders empty table with no data", () => {
    render(<TestWrapper data={[]} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    // Headers still visible
    expect(screen.getByText("Name")).toBeInTheDocument();
  });
});
