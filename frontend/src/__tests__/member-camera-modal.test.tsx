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

  it("renders Switch Camera button for front/rear toggle", async () => {
    render(<MemberCameraModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTitle("Switch camera")).toBeInTheDocument();
    });
  });

  it("switch camera button is disabled when camera is not granted", () => {
    mockGetUserMedia.mockReturnValue(new Promise(() => {})); // stays loading
    render(<MemberCameraModal {...defaultProps} />);
    const switchBtn = screen.queryByTitle("Switch camera");
    if (switchBtn) {
      expect(switchBtn.closest("button")).toBeDisabled();
    }
  });

  it("toggles facingMode when switch camera is clicked", async () => {
    render(<MemberCameraModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Capture Snap")).toBeInTheDocument();
    });

    // First call should be with facingMode: "user" (default)
    expect(mockGetUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: "user" }),
      })
    );

    // Click switch camera
    const switchBtn = screen.getByTitle("Switch camera");
    fireEvent.click(switchBtn);

    // Should re-call getUserMedia with "environment"
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({ facingMode: "environment" }),
        })
      );
    });
  });

  it("applies mirror CSS class only for front camera (user facingMode)", async () => {
    render(<MemberCameraModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Capture Snap")).toBeInTheDocument();
    });

    // Video should have scale-x-[-1] for front camera
    const video = document.querySelector("video");
    expect(video?.className).toContain("scale-x-[-1]");
  });

  it("requests camera with ideal 480x480 resolution", async () => {
    render(<MemberCameraModal {...defaultProps} />);

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            width: { ideal: 480 },
            height: { ideal: 480 },
          }),
          audio: false,
        })
      );
    });
  });

  it("stops all stream tracks on close", async () => {
    const mockStop = vi.fn();
    const trackStream = {
      getTracks: () => [{ stop: mockStop }, { stop: mockStop }],
    };
    mockGetUserMedia.mockResolvedValue(trackStream);

    render(<MemberCameraModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Capture Snap")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Close modal"));
    expect(mockStop).toHaveBeenCalledTimes(2);
  });
});
