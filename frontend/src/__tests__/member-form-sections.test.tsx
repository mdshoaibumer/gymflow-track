import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemberForm } from "@/components/members/member-form";

// Mock custom fields hook
vi.mock("@/hooks/use-custom-fields", () => ({
  useCustomFields: () => ({ data: { fields: [] } }),
}));

// Mock unsaved changes hook
vi.mock("@/hooks/use-unsaved-changes", () => ({
  useUnsavedChanges: () => {},
}));

// Mock camera modal
vi.mock("@/components/members/member-camera-modal", () => ({
  MemberCameraModal: () => null,
}));

describe("MemberForm", () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    submitLabel: "Add Member",
    title: "Add New Member",
  };

  it("renders the form title", () => {
    render(<MemberForm {...defaultProps} />);
    expect(screen.getByText("Add New Member")).toBeInTheDocument();
  });

  it("renders 'Personal Details' section header", () => {
    render(<MemberForm {...defaultProps} />);
    expect(screen.getByText("Personal Details")).toBeInTheDocument();
  });

  it("renders 'Membership & Initial Payment' section header", () => {
    render(<MemberForm {...defaultProps} />);
    expect(
      screen.getByText(/membership & initial payment/i)
    ).toBeInTheDocument();
  });

  it("indicates payment section is optional", () => {
    render(<MemberForm {...defaultProps} />);
    expect(
      screen.getByText(/can also be added later from payments/i)
    ).toBeInTheDocument();
  });

  it("renders member personal fields (name, phone, email, gender)", () => {
    render(<MemberForm {...defaultProps} />);
    expect(screen.getByLabelText(/name \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gender/i)).toBeInTheDocument();
  });

  it("renders membership/payment fields (plan, amount, dates)", () => {
    render(<MemberForm {...defaultProps} />);
    expect(screen.getByLabelText(/plan/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount paid/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
  });

  it("personal details section appears before payment section in DOM order", () => {
    render(<MemberForm {...defaultProps} />);
    const personalHeader = screen.getByText("Personal Details");
    const paymentHeader = screen.getByText(/membership & initial payment/i);

    // Compare document position
    const position = personalHeader.compareDocumentPosition(paymentHeader);
    // DOCUMENT_POSITION_FOLLOWING = 4
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
