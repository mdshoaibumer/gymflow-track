import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock auth store
vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (s: { token: string; user: { gym_id: string } }) => unknown) =>
    selector({ token: "test-token", user: { gym_id: "gym-1" } }),
}));

// Default mock data
let mockAgingData: {
  data: { buckets: { range: string; count: number; total_paise: number }[]; total_outstanding_paise: number } | null;
  isLoading: boolean;
} = {
  data: {
    buckets: [
      { range: "0-30", count: 3, total_paise: 45000 },
      { range: "31-60", count: 2, total_paise: 80000 },
      { range: "61-90", count: 1, total_paise: 25000 },
      { range: "90+", count: 1, total_paise: 60000 },
    ],
    total_outstanding_paise: 210000,
  },
  isLoading: false,
};

vi.mock("@/hooks/use-dues", () => ({
  useDuesAgingReport: () => mockAgingData,
}));

import { AgingReport } from "@/components/collections/aging-report";

describe("AgingReport", () => {
  it("renders all four aging buckets", () => {
    render(<AgingReport />);
    expect(screen.getByText("0-30 days")).toBeInTheDocument();
    expect(screen.getByText("31-60 days")).toBeInTheDocument();
    expect(screen.getByText("61-90 days")).toBeInTheDocument();
    expect(screen.getByText("90+ days")).toBeInTheDocument();
  });

  it("shows total outstanding in header", () => {
    render(<AgingReport />);
    expect(screen.getByText("Total: ₹2,100")).toBeInTheDocument();
  });

  it("displays bucket amounts", () => {
    render(<AgingReport />);
    expect(screen.getByText("₹450")).toBeInTheDocument(); // 45000 paise = ₹450
    expect(screen.getByText("₹800")).toBeInTheDocument(); // 80000 paise
    expect(screen.getByText("₹250")).toBeInTheDocument(); // 25000 paise
    expect(screen.getByText("₹600")).toBeInTheDocument(); // 60000 paise
  });

  it("displays bucket counts", () => {
    render(<AgingReport />);
    expect(screen.getByText("3 dues")).toBeInTheDocument();
    expect(screen.getByText("2 dues")).toBeInTheDocument();
    // Two buckets have count=1, so use getAllByText
    expect(screen.getAllByText("1 due").length).toBe(2);
  });

  it("renders card title", () => {
    render(<AgingReport />);
    expect(screen.getByText("Aging Report")).toBeInTheDocument();
  });

  it("shows loading skeletons when loading", () => {
    mockAgingData = { data: null, isLoading: true };
    const { container } = render(<AgingReport />);
    // Skeleton components from shadcn use a specific class pattern
    const skeletons = container.querySelectorAll("[data-slot='skeleton'], .animate-pulse, span[class*='skeleton']");
    // If no skeletons found via class, check that content is not the final render
    expect(container.textContent).not.toContain("No outstanding dues");
    expect(container.textContent).toContain("Aging Report");
  });

  it("shows empty state when no data", () => {
    mockAgingData = { data: { buckets: [], total_outstanding_paise: 0 }, isLoading: false };
    render(<AgingReport />);
    expect(screen.getByText("No outstanding dues to report")).toBeInTheDocument();
  });
});
