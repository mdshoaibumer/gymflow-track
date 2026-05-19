"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, Trash2, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadMemberPhoto, useDeleteMemberPhoto } from "@/hooks/use-members";
import { API_URL } from "@/lib/api";
import { MemberCameraModal } from "./member-camera-modal";
import { PhotoPreviewModal } from "./photo-preview-modal";
import { compressImage } from "@/lib/compress-image";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface MemberPhotoUploadProps {
  memberId: string;
  photoUrl: string | null;
}

export function MemberPhotoUpload({ memberId, photoUrl }: MemberPhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPhotoPreviewOpen, setIsPhotoPreviewOpen] = useState(false);
  const uploadMutation = useUploadMemberPhoto();
  const deleteMutation = useDeleteMemberPhoto();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cacheBust, setCacheBust] = useState(0);

  const fullPhotoUrl = photoUrl
    ? `${API_URL.replace("/api/v1", "")}${photoUrl}?cb=${cacheBust}`
    : null;

  const displayUrl = previewUrl || fullPhotoUrl;

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Client-side validation
      if (!ACCEPTED_TYPES.includes(file.type)) {
        alert("Please select a JPEG, PNG, or WebP image.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert("Photo must be under 10MB.");
        return;
      }

      // Compress image before upload
      const compressed = await compressImage(file);

      // Show local preview immediately
      const objectUrl = URL.createObjectURL(compressed);
      setPreviewUrl(objectUrl);

      // Upload
      uploadMutation.mutate(
        { id: memberId, file: compressed },
        {
          onSuccess: () => {
            setCacheBust((prev) => prev + 1);
            URL.revokeObjectURL(objectUrl);
            setPreviewUrl(null);
          },
          onError: () => {
            URL.revokeObjectURL(objectUrl);
            setPreviewUrl(null);
          },
        }
      );

      // Reset input so re-selecting the same file triggers onChange
      e.target.value = "";
    },
    [memberId, uploadMutation]
  );

  const handleCameraCapture = useCallback(
    async (file: File) => {
      const compressed = await compressImage(file);
      const objectUrl = URL.createObjectURL(compressed);
      setPreviewUrl(objectUrl);

      uploadMutation.mutate(
        { id: memberId, file: compressed },
        {
          onSuccess: () => {
            setCacheBust((prev) => prev + 1);
            URL.revokeObjectURL(objectUrl);
            setPreviewUrl(null);
          },
          onError: () => {
            URL.revokeObjectURL(objectUrl);
            setPreviewUrl(null);
          },
        }
      );
    },
    [memberId, uploadMutation]
  );

  const handleDelete = useCallback(() => {
    if (!confirm("Remove this member's photo?")) return;
    deleteMutation.mutate(memberId, {
      onSuccess: () => {
        setCacheBust((prev) => prev + 1);
      },
    });
    setPreviewUrl(null);
  }, [memberId, deleteMutation]);

  const isLoading = uploadMutation.isPending || deleteMutation.isPending;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Photo display */}
      <div
        className="relative h-24 w-24 rounded-full overflow-hidden border-2 border-muted bg-muted flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
        onClick={() => {
          if (displayUrl) setIsPhotoPreviewOpen(true);
        }}
        title={displayUrl ? "Click to view full photo" : undefined}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {displayUrl ? (
          <img
            src={displayUrl}
            alt="Member photo"
            className="h-full w-full object-cover"
          />
        ) : (
          <User className="h-10 w-10 text-muted-foreground" />
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          <Camera className="mr-1.5 h-3.5 w-3.5" />
          Upload Photo
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsCameraOpen(true)}
          disabled={isLoading}
        >
          <Camera className="mr-1.5 h-3.5 w-3.5" />
          Take Snap
        </Button>

        {photoUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={isLoading}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload member photo"
      />

      <MemberCameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
      />

      <PhotoPreviewModal
        isOpen={isPhotoPreviewOpen}
        imageUrl={displayUrl}
        onClose={() => setIsPhotoPreviewOpen(false)}
      />
    </div>
  );
}
