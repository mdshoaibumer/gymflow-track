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

// Mock photo preview modal
vi.mock("@/components/members/photo-preview-modal", () => ({
  PhotoPreviewModal: () => null,
}));

// Mock compress-image
vi.mock("@/lib/compress-image", () => ({
  compressImage: vi.fn((file: File) => Promise.resolve(file)),
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

  it("does NOT render membership payment section header", () => {
    render(<MemberForm {...defaultProps} />);
    expect(
      screen.queryByText(/membership & initial payment/i)
    ).not.toBeInTheDocument();
  });

  it("renders member personal fields (name, phone, email, gender)", () => {
    render(<MemberForm {...defaultProps} />);
    expect(screen.getByLabelText(/name \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gender/i)).toBeInTheDocument();
  });

  it("does NOT render membership/payment fields in the form", () => {
    render(<MemberForm {...defaultProps} />);
    expect(screen.queryByLabelText(/plan/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/amount paid/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/start date/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/end date/i)).not.toBeInTheDocument();
  });

  it("personal details section is present in the form", () => {
    render(<MemberForm {...defaultProps} />);
    const personalHeader = screen.getByText("Personal Details");
    expect(personalHeader).toBeInTheDocument();
  });

  it("renders 'Member Photo' label", () => {
    render(<MemberForm {...defaultProps} />);
    expect(screen.getByText("Member Photo")).toBeInTheDocument();
  });

  it("renders Upload Photo and Take Snap buttons", () => {
    render(<MemberForm {...defaultProps} />);
    expect(screen.getByText("Upload Photo")).toBeInTheDocument();
    expect(screen.getByText("Take Snap")).toBeInTheDocument();
  });

  it("shows auto-compression info text", () => {
    render(<MemberForm {...defaultProps} />);
    expect(
      screen.getByText(/auto-compressed/i)
    ).toBeInTheDocument();
  });

  it("renders a hidden file input with capture attribute", () => {
    const { container } = render(<MemberForm {...defaultProps} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute("accept", ".jpg,.jpeg,.png,.webp");
    expect(fileInput).toHaveAttribute("capture", "environment");
    expect(fileInput).toHaveClass("hidden");
  });

  it("shows clickable photo avatar placeholder", () => {
    render(<MemberForm {...defaultProps} />);
    // The photo container should have cursor-pointer class
    const photoContainer = screen.getByText("Upload Photo").closest(".sm\\:col-span-2")?.querySelector(".cursor-pointer");
    expect(photoContainer).toBeInTheDocument();
  });
});
