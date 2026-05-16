"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, Trash2, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadMemberPhoto, useDeleteMemberPhoto } from "@/hooks/use-members";
import { API_URL } from "@/lib/api";

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
  const uploadMutation = useUploadMemberPhoto();
  const deleteMutation = useDeleteMemberPhoto();

  const fullPhotoUrl = photoUrl
    ? `${API_URL.replace("/api/v1", "")}${photoUrl}`
    : null;

  const displayUrl = previewUrl || fullPhotoUrl;

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Client-side validation
      if (!ACCEPTED_TYPES.includes(file.type)) {
        alert("Please select a JPEG, PNG, or WebP image.");
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        alert(`Photo must be under ${MAX_SIZE_MB}MB.`);
        return;
      }

      // Show local preview immediately
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);

      // Upload
      uploadMutation.mutate(
        { id: memberId, file },
        {
          onSuccess: () => {
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

  const handleDelete = useCallback(() => {
    if (!confirm("Remove this member's photo?")) return;
    deleteMutation.mutate(memberId);
    setPreviewUrl(null);
  }, [memberId, deleteMutation]);

  const isLoading = uploadMutation.isPending || deleteMutation.isPending;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Photo display */}
      <div className="relative h-24 w-24 rounded-full overflow-hidden border-2 border-muted bg-muted flex items-center justify-center">
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
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          <Camera className="mr-1.5 h-3.5 w-3.5" />
          {photoUrl ? "Change" : "Upload"}
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
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload member photo"
      />
    </div>
  );
}
