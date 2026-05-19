import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PhotoPreviewModal } from "@/components/members/photo-preview-modal";

describe("PhotoPreviewModal", () => {
  const defaultProps = {
    isOpen: true,
    imageUrl: "https://example.com/photo.jpg",
    onClose: vi.fn(),
  };

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <PhotoPreviewModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when imageUrl is null", () => {
    const { container } = render(
      <PhotoPreviewModal {...defaultProps} imageUrl={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("displays the image when open with a valid URL", () => {
    render(<PhotoPreviewModal {...defaultProps} />);
    const img = screen.getByAltText("Member photo preview");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
  });

  it("renders a close button", () => {
    render(<PhotoPreviewModal {...defaultProps} />);
    const closeBtn = screen.getByLabelText("Close preview");
    expect(closeBtn).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<PhotoPreviewModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close preview"));
    // Click bubbles to backdrop which also calls onClose
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <PhotoPreviewModal {...defaultProps} onClose={onClose} />
    );
    // Click the backdrop (first child of container)
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when image itself is clicked", () => {
    const onClose = vi.fn();
    render(<PhotoPreviewModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByAltText("Member photo preview"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<PhotoPreviewModal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close on other key presses", () => {
    const onClose = vi.fn();
    render(<PhotoPreviewModal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
