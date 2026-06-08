import { describe, it, expect, vi, beforeEach } from "vitest";
import { compressImage } from "@/lib/compress-image";

// Mock createImageBitmap
const mockBitmap = {
  width: 2000,
  height: 1500,
  close: vi.fn(),
};

vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(mockBitmap));

describe("compressImage", () => {
  let mockCanvas: {
    width: number;
    height: number;
    toBlob: ReturnType<typeof vi.fn>;
    getContext: ReturnType<typeof vi.fn>;
  };
  let mockCtx: { drawImage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockBitmap.close.mockClear();

    mockCtx = { drawImage: vi.fn() };
    mockCanvas = {
      width: 0,
      height: 0,
      toBlob: vi.fn(),
      getContext: vi.fn().mockReturnValue(mockCtx),
    };

    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return mockCanvas as unknown as HTMLCanvasElement;
      return document.createElement(tag);
    });
  });

  it("returns original file if under target size (500KB)", async () => {
    const smallFile = new File(["x".repeat(100)], "small.jpg", {
      type: "image/jpeg",
    });
    // Override size since File constructor may not reflect actual byte size properly
    Object.defineProperty(smallFile, "size", { value: 200 * 1024 });

    const result = await compressImage(smallFile);
    expect(result).toBe(smallFile);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("compresses large files by resizing and reducing quality", async () => {
    const largeFile = new File(["x"], "large.png", { type: "image/png" });
    Object.defineProperty(largeFile, "size", { value: 3 * 1024 * 1024 }); // 3MB

    const compressedBlob = new Blob(["compressed"], { type: "image/jpeg" });
    Object.defineProperty(compressedBlob, "size", { value: 400 * 1024 }); // 400KB

    mockCanvas.toBlob.mockImplementation(
      (callback: (blob: Blob | null) => void) => {
        callback(compressedBlob);
      }
    );

    const result = await compressImage(largeFile);

    expect(createImageBitmap).toHaveBeenCalledWith(largeFile);
    expect(mockBitmap.close).toHaveBeenCalled();
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("large.jpg");
  });

  it("resizes image to max 800px on longest side", async () => {
    const largeFile = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(largeFile, "size", { value: 2 * 1024 * 1024 });

    // Mock a wide image: 2000x1500
    mockBitmap.width = 2000;
    mockBitmap.height = 1500;

    const compressedBlob = new Blob(["compressed"], { type: "image/jpeg" });
    Object.defineProperty(compressedBlob, "size", { value: 300 * 1024 });

    mockCanvas.toBlob.mockImplementation(
      (callback: (blob: Blob | null) => void) => {
        callback(compressedBlob);
      }
    );

    await compressImage(largeFile);

    // Width should be 800, height should be proportional: round(1500/2000 * 800) = 600
    expect(mockCanvas.width).toBe(800);
    expect(mockCanvas.height).toBe(600);
  });

  it("resizes tall images correctly (height > width)", async () => {
    const largeFile = new File(["x"], "tall.png", { type: "image/png" });
    Object.defineProperty(largeFile, "size", { value: 2 * 1024 * 1024 });

    mockBitmap.width = 600;
    mockBitmap.height = 1200;

    const compressedBlob = new Blob(["compressed"], { type: "image/jpeg" });
    Object.defineProperty(compressedBlob, "size", { value: 200 * 1024 });

    mockCanvas.toBlob.mockImplementation(
      (callback: (blob: Blob | null) => void) => {
        callback(compressedBlob);
      }
    );

    await compressImage(largeFile);

    // Height should be 800, width should be proportional: round(600/1200 * 800) = 400
    expect(mockCanvas.height).toBe(800);
    expect(mockCanvas.width).toBe(400);
  });

  it("iteratively reduces quality if first attempt is still too large", async () => {
    const largeFile = new File(["x"], "huge.jpg", { type: "image/jpeg" });
    Object.defineProperty(largeFile, "size", { value: 4 * 1024 * 1024 });

    let callCount = 0;
    mockCanvas.toBlob.mockImplementation(
      (callback: (blob: Blob | null) => void, _type: string, quality: number) => {
        callCount++;
        // First two calls return too-large blob, third one passes
        const size = quality > 0.7 ? 600 * 1024 : 400 * 1024;
        const blob = new Blob(["data"], { type: "image/jpeg" });
        Object.defineProperty(blob, "size", { value: size });
        callback(blob);
      }
    );

    await compressImage(largeFile);

    // Should have been called multiple times (quality reduction iterations)
    expect(callCount).toBeGreaterThan(1);
  });

  it("falls back to original file if canvas context is null", async () => {
    const largeFile = new File(["x"], "nocontext.jpg", { type: "image/jpeg" });
    Object.defineProperty(largeFile, "size", { value: 2 * 1024 * 1024 });

    mockCanvas.getContext.mockReturnValue(null);

    const result = await compressImage(largeFile);
    expect(result).toBe(largeFile);
    expect(mockBitmap.close).toHaveBeenCalled();
  });

  it("falls back to original file if toBlob returns null", async () => {
    const largeFile = new File(["x"], "noblob.jpg", { type: "image/jpeg" });
    Object.defineProperty(largeFile, "size", { value: 2 * 1024 * 1024 });

    mockCanvas.toBlob.mockImplementation(
      (callback: (blob: Blob | null) => void) => {
        callback(null);
      }
    );

    const result = await compressImage(largeFile);
    expect(result).toBe(largeFile);
  });

  it("handles HEIC files (iOS) by processing through canvas like any other image", async () => {
    const heicFile = new File(["heicdata"], "IMG_0001.heic", { type: "image/heic" });
    Object.defineProperty(heicFile, "size", { value: 3 * 1024 * 1024 });

    const compressedBlob = new Blob(["compressed"], { type: "image/jpeg" });
    Object.defineProperty(compressedBlob, "size", { value: 300 * 1024 });

    mockCanvas.toBlob.mockImplementation(
      (callback: (blob: Blob | null) => void) => {
        callback(compressedBlob);
      }
    );

    const result = await compressImage(heicFile);

    expect(createImageBitmap).toHaveBeenCalledWith(heicFile);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("IMG_0001.jpg"); // Extension changed to .jpg
  });

  it("renames output file extension from .heif to .jpg", async () => {
    const heifFile = new File(["heifdata"], "photo.heif", { type: "image/heif" });
    Object.defineProperty(heifFile, "size", { value: 2 * 1024 * 1024 });

    const compressedBlob = new Blob(["compressed"], { type: "image/jpeg" });
    Object.defineProperty(compressedBlob, "size", { value: 200 * 1024 });

    mockCanvas.toBlob.mockImplementation(
      (callback: (blob: Blob | null) => void) => {
        callback(compressedBlob);
      }
    );

    const result = await compressImage(heifFile);
    expect(result.name).toBe("photo.jpg");
  });

  it("does not resize images already within 800px dimensions", async () => {
    const largeFile = new File(["x"], "medium.jpg", { type: "image/jpeg" });
    Object.defineProperty(largeFile, "size", { value: 600 * 1024 }); // Over 500KB target

    mockBitmap.width = 700;
    mockBitmap.height = 500;

    const compressedBlob = new Blob(["compressed"], { type: "image/jpeg" });
    Object.defineProperty(compressedBlob, "size", { value: 400 * 1024 });

    mockCanvas.toBlob.mockImplementation(
      (callback: (blob: Blob | null) => void) => {
        callback(compressedBlob);
      }
    );

    await compressImage(largeFile);

    // Should keep original dimensions since both are under 800
    expect(mockCanvas.width).toBe(700);
    expect(mockCanvas.height).toBe(500);
  });
});
