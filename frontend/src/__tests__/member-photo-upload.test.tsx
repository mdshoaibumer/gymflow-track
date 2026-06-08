import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemberPhotoUpload } from "@/components/members/member-photo-upload";

// Mock hooks
const mockUploadMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock("@/hooks/use-members", () => ({
  useUploadMemberPhoto: () => ({
    mutate: mockUploadMutate,
    isPending: false,
  }),
  useDeleteMemberPhoto: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
}));

vi.mock("@/lib/compress-image", () => ({
  compressImage: vi.fn((file: File) => Promise.resolve(file)),
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

describe("MemberPhotoUpload", () => {
  const defaultProps = {
    memberId: "member-123",
    photoUrl: null as string | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders placeholder icon when no photo", () => {
    render(<MemberPhotoUpload {...defaultProps} />);
    // Should show User icon (SVG) as placeholder
    expect(screen.queryByAltText("Member photo")).not.toBeInTheDocument();
  });

  it("renders Upload Photo button", () => {
    render(<MemberPhotoUpload {...defaultProps} />);
    expect(screen.getByText("Upload Photo")).toBeInTheDocument();
  });

  it("renders Take Snap button", () => {
    render(<MemberPhotoUpload {...defaultProps} />);
    expect(screen.getByText("Take Snap")).toBeInTheDocument();
  });

  it("does not render Remove button when no photo", () => {
    render(<MemberPhotoUpload {...defaultProps} />);
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
  });

  it("renders Remove button when photo exists", () => {
    render(<MemberPhotoUpload {...defaultProps} photoUrl="/uploads/members/gym1/member-123.jpg" />);
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("renders member photo when photoUrl is provided", () => {
    render(<MemberPhotoUpload {...defaultProps} photoUrl="/uploads/members/gym1/member-123.jpg" />);
    const img = screen.getByAltText("Member photo");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toContain("/uploads/members/gym1/member-123.jpg");
  });

  it("hidden file input does NOT have capture attribute (allows gallery access on mobile)", () => {
    render(<MemberPhotoUpload {...defaultProps} />);
    const input = screen.getByLabelText("Upload member photo");
    expect(input).not.toHaveAttribute("capture");
  });

  it("file input accepts JPEG, PNG, WebP, and HEIC formats", () => {
    render(<MemberPhotoUpload {...defaultProps} />);
    const input = screen.getByLabelText("Upload member photo");
    const accept = input.getAttribute("accept") || "";
    expect(accept).toContain("image/jpeg");
    expect(accept).toContain("image/png");
    expect(accept).toContain("image/webp");
    expect(accept).toContain("image/heic");
    expect(accept).toContain("image/heif");
  });

  it("rejects files with invalid MIME type", async () => {
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<MemberPhotoUpload {...defaultProps} />);

    const input = screen.getByLabelText("Upload member photo");
    const invalidFile = new File(["data"], "test.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("JPEG, PNG, WebP, or HEIC"));
    });
    expect(mockUploadMutate).not.toHaveBeenCalled();
    alertMock.mockRestore();
  });

  it("rejects files over 10MB", async () => {
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<MemberPhotoUpload {...defaultProps} />);

    const input = screen.getByLabelText("Upload member photo");
    const bigFile = new File(["x"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(bigFile, "size", { value: 11 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith("Photo must be under 10MB.");
    });
    expect(mockUploadMutate).not.toHaveBeenCalled();
    alertMock.mockRestore();
  });

  it("calls upload mutation with compressed file on valid selection", async () => {
    render(<MemberPhotoUpload {...defaultProps} />);

    const input = screen.getByLabelText("Upload member photo");
    const validFile = new File(["imagedata"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(validFile, "size", { value: 500 * 1024 });

    fireEvent.change(input, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(mockUploadMutate).toHaveBeenCalledWith(
        { id: "member-123", file: expect.any(File) },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
      );
    });
  });

  it("accepts HEIC files from iPhone", async () => {
    render(<MemberPhotoUpload {...defaultProps} />);

    const input = screen.getByLabelText("Upload member photo");
    const heicFile = new File(["heicdata"], "IMG_001.heic", { type: "image/heic" });
    Object.defineProperty(heicFile, "size", { value: 2 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [heicFile] } });

    await waitFor(() => {
      expect(mockUploadMutate).toHaveBeenCalled();
    });
  });

  it("calls delete mutation when Remove is clicked and confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<MemberPhotoUpload {...defaultProps} photoUrl="/uploads/members/gym1/member-123.jpg" />);
    fireEvent.click(screen.getByText("Remove"));

    expect(mockDeleteMutate).toHaveBeenCalledWith(
      "member-123",
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it("does not delete when confirmation is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<MemberPhotoUpload {...defaultProps} photoUrl="/uploads/members/gym1/member-123.jpg" />);
    fireEvent.click(screen.getByText("Remove"));

    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it("opens camera modal when Take Snap is clicked", () => {
    render(<MemberPhotoUpload {...defaultProps} />);
    fireEvent.click(screen.getByText("Take Snap"));
    // Camera modal should open — it renders "Capture Member Photo" heading
    expect(screen.getByText("Capture Member Photo")).toBeInTheDocument();
  });
});
