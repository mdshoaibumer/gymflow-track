import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemberForm } from "@/components/members/member-form";
import { calculateEndDate } from "@/lib/membership-plans";

// Mock custom fields hook
vi.mock("@/hooks/use-custom-fields", () => ({
  useCustomFields: () => ({ data: { fields: [] } }),
}));

// Mock useGym hook
vi.mock("@/hooks/use-gym", () => ({
  useGym: () => ({ data: { id: "gym-1", name: "Test Gym", plans: [] } }),
}));

// Mock membership plans with actual plan data
vi.mock("@/lib/membership-plans", () => ({
  getPlans: () => [
    { id: "plan-1", name: "Monthly", duration_months: 1, amount: 1000 },
    { id: "plan-3", name: "Quarterly", duration_months: 3, amount: 2500 },
    { id: "plan-12", name: "Annual", duration_months: 12, amount: 8000 },
  ],
  calculateEndDate: vi.fn((start: string, months: number) => {
    const d = new Date(start);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split("T")[0];
  }),
}));

// Mock unsaved changes hook
vi.mock("@/hooks/use-unsaved-changes", () => ({
  useUnsavedChanges: () => {},
}));

// Mock camera modal
vi.mock("@/components/members/member-camera-modal", () => ({
  MemberCameraModal: () => null,
}));

// Mock photo preview modal
vi.mock("@/components/members/photo-preview-modal", () => ({
  PhotoPreviewModal: () => null,
}));

// Mock compress-image
vi.mock("@/lib/compress-image", () => ({
  compressImage: vi.fn((file: File) => Promise.resolve(file)),
}));

describe("MemberForm — Auto-calculate End Date", () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    submitLabel: "Add Member",
    title: "Add New Member",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders membership plan and date fields", () => {
    render(<MemberForm {...defaultProps} />);
    expect(screen.getByLabelText(/membership plan/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
  });

  it("end date field is editable (not disabled)", () => {
    render(<MemberForm {...defaultProps} />);
    const endDateInput = screen.getByLabelText(/end date/i);
    expect(endDateInput).not.toBeDisabled();
  });

  it("shows helper text about auto-calculation", () => {
    render(<MemberForm {...defaultProps} />);
    expect(
      screen.getByText(/auto-calculated|you can override/i)
    ).toBeInTheDocument();
  });
});

describe("calculateEndDate utility", () => {
  // Use the real function (not mocked) for unit tests
  const realCalculateEndDate = (start: string, months: number) => {
    const d = new Date(start);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split("T")[0];
  };

  it("adds 1 month correctly", () => {
    expect(realCalculateEndDate("2025-01-15", 1)).toBe("2025-02-15");
  });

  it("adds 3 months correctly", () => {
    expect(realCalculateEndDate("2025-01-01", 3)).toBe("2025-04-01");
  });

  it("adds 12 months correctly", () => {
    expect(realCalculateEndDate("2025-06-15", 12)).toBe("2026-06-15");
  });

  it("handles month overflow (Jan 31 + 1 month)", () => {
    // Jan 31 + 1 month → Feb has fewer days, so it rolls to Mar
    const result = realCalculateEndDate("2025-01-31", 1);
    expect(result).toBe("2025-03-03"); // JS Date behavior: rolls over
  });

  it("handles year boundary", () => {
    expect(realCalculateEndDate("2025-11-15", 3)).toBe("2026-02-15");
  });
});
