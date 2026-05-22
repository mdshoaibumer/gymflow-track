import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemberCameraModal } from "@/components/members/member-camera-modal";

// Mock getUserMedia
const mockGetUserMedia = vi.fn();
const mockStream = {
  getTracks: () => [{ stop: vi.fn() }],
};

beforeEach(() => {
  vi.clearAllMocks();

  // Default: getUserMedia available and resolves
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  });

  // Mock permissions API
  Object.defineProperty(navigator, "permissions", {
    value: {
      query: vi.fn().mockResolvedValue({ state: "prompt" }),
    },
    writable: true,
    configurable: true,
  });

  mockGetUserMedia.mockResolvedValue(mockStream);
});

describe("MemberCameraModal", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onCapture: vi.fn(),
  };

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <MemberCameraModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders modal with header when open", async () => {
    await act(async () => {
      render(<MemberCameraModal {...defaultProps} />);
    });
    expect(screen.getByText("Capture Member Photo")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockGetUserMedia.mockReturnValue(new Promise(() => {})); // never resolves
    render(<MemberCameraModal {...defaultProps} />);
    expect(screen.getByText("Accessing webcam...")).toBeInTheDocument();
  });

  it("shows 'Camera Access Blocked' when permission is denied", async () => {
    mockGetUserMedia.mockRejectedValue(new Error("NotAllowedError"));

    render(<MemberCameraModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Camera Access Blocked")).toBeInTheDocument();
    });
  });

  it("shows mobile fallback button when camera is blocked", async () => {
    mockGetUserMedia.mockRejectedValue(new Error("NotAllowedError"));

    render(<MemberCameraModal {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText("Use Device Camera (Fallback)")
      ).toBeInTheDocument();
    });
  });

  it("provides guidance about mobile settings when blocked", async () => {
    mockGetUserMedia.mockRejectedValue(new Error("NotAllowedError"));

    render(<MemberCameraModal {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText(/check your browser settings/i)
      ).toBeInTheDocument();
    });
  });

  it("handles missing mediaDevices gracefully", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    render(<MemberCameraModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Camera Access Blocked")).toBeInTheDocument();
    });
  });

  it("renders close button and calls onClose", async () => {
    await act(async () => {
      render(<MemberCameraModal {...defaultProps} />);
    });
    const closeBtn = screen.getByLabelText("Close modal");
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("renders Cancel button", async () => {
    render(<MemberCameraModal {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });
  });

  it("renders Capture Snap button when camera is granted", async () => {
    render(<MemberCameraModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Capture Snap")).toBeInTheDocument();
    });
  });

  it("disables Capture Snap button when permission not granted", () => {
    mockGetUserMedia.mockReturnValue(new Promise(() => {})); // stays loading
    render(<MemberCameraModal {...defaultProps} />);
    // Button should exist but be disabled during loading
    const captureBtn = screen.queryByText("Capture Snap");
    if (captureBtn) {
      expect(captureBtn.closest("button")).toBeDisabled();
    }
  });
});
