/**
 * Compresses an image file to a target max size using canvas resizing and JPEG quality reduction.
 * Returns a new File with the compressed image data.
 */

const MAX_DIMENSION = 800; // max width/height in pixels
const TARGET_MAX_SIZE = 500 * 1024; // 500KB target max
const INITIAL_QUALITY = 0.85;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.1;

export async function compressImage(file: File): Promise<File> {
  // If already small enough, return as-is
  if (file.size <= TARGET_MAX_SIZE) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Calculate new dimensions maintaining aspect ratio
  let newWidth = width;
  let newHeight = height;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      newWidth = MAX_DIMENSION;
      newHeight = Math.round((height / width) * MAX_DIMENSION);
    } else {
      newHeight = MAX_DIMENSION;
      newWidth = Math.round((width / height) * MAX_DIMENSION);
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = newWidth;
  canvas.height = newHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file; // fallback to original if canvas fails
  }

  ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
  bitmap.close();

  // Iteratively reduce quality until under target size
  let quality = INITIAL_QUALITY;
  let blob: Blob | null = null;

  while (quality >= MIN_QUALITY) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });

    if (blob && blob.size <= TARGET_MAX_SIZE) {
      break;
    }
    quality -= QUALITY_STEP;
  }

  // Final attempt at minimum quality if still too large
  if (!blob || blob.size > TARGET_MAX_SIZE) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", MIN_QUALITY);
    });
  }

  if (!blob) {
    return file; // fallback to original
  }

  const compressedFile = new File(
    [blob],
    file.name.replace(/\.[^.]+$/, ".jpg"),
    { type: "image/jpeg", lastModified: Date.now() }
  );

  return compressedFile;
}
