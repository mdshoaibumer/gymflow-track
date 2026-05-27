"use client";

import { useRef, useState } from "react";
import { Upload, Trash2, ImageIcon, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { gymService } from "@/services/gym.service";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { API_URL } from "@/lib/api";
import { compressImage } from "@/lib/compress-image";

interface GymLogoUploadProps {
  logoUrl: string | null;
  disabled?: boolean;
}

const getFullAssetUrl = (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  try {
    const origin = new URL(API_URL).origin;
    return `${origin}${url}`;
  } catch {
    return url;
  }
};

export function GymLogoUpload({ logoUrl, disabled }: GymLogoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => gymService.uploadLogo(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gym"] });
      setPreview(null);
      toast.success("Logo uploaded successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to upload logo");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => gymService.deleteLogo(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gym"] });
      setPreview(null);
      toast.success("Logo removed");
    },
    onError: () => {
      toast.error("Failed to remove logo");
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate client-side
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please select a JPEG, PNG, or WebP image");
      return;
    }

    try {
      // Compress the image before uploading
      const compressed = await compressImage(file);

      if (compressed.size > 2 * 1024 * 1024) {
        toast.error("Logo must be under 2MB");
        return;
      }

      // Show preview
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(compressed);

      uploadMutation.mutate(compressed);
    } catch (error) {
      console.error("Failed to compress logo:", error);
      toast.error("Error processing image file");
    } finally {
      // Reset input so same file can be re-selected
      e.target.value = "";
    }
  };

  const currentImage = preview || getFullAssetUrl(logoUrl);
  const isLoading = uploadMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {/* Logo preview */}
        <div className="relative h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/50">
          {currentImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={currentImage}
              alt="Gym logo"
              className="h-full w-full object-contain"
            />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
          )}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || isLoading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-2" />
            {logoUrl ? "Change Logo" : "Upload Logo"}
          </Button>
          {logoUrl && (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || isLoading}
              onClick={() => deleteMutation.mutate()}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Remove
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        JPEG, PNG, or WebP. Max 2MB. Used on invoices.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
