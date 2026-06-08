"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, Check, RotateCcw, Loader2, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MemberCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export function MemberCameraModal({ isOpen, onClose, onCapture }: MemberCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permissionState, setPermissionState] = useState<"prompt" | "granted" | "denied" | "loading">("loading");
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Start webcam stream when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setPermissionState("loading");
    setCapturedBlob(null);
    setPreviewUrl(null);

    async function startCamera() {
      try {
        // Check if mediaDevices is available (requires HTTPS on mobile)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          if (active) setPermissionState("denied");
          return;
        }

        // On supported browsers, check permission state first
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const result = await navigator.permissions.query({ name: "camera" as PermissionName });
            if (result.state === "denied" && active) {
              setPermissionState("denied");
              return;
            }
          } catch {
            // permissions.query may not support 'camera' on all browsers, continue normally
          }
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 480 },
            height: { ideal: 480 },
            facingMode: facingMode,
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setPermissionState("granted");
      } catch (err: unknown) {
        console.error("Camera access failed:", err);
        if (active) setPermissionState("denied");
      }
    }

    startCamera();

    return () => {
      active = false;
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleCapture = () => {
    if (!videoRef.current) return;

    // Snapping flash effect
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 150);

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    
    // Create a 1:1 square crop from the video center
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = 400;
    canvas.height = 400;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Mirror only for front camera to match the video mirror effect for a natural selfie photo
      if (facingMode === "user") {
        ctx.translate(400, 0);
        ctx.scale(-1, 1);
      }

      // Draw centered video slice onto the canvas
      const sx = (video.videoWidth - size) / 2;
      const sy = (video.videoHeight - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, 400, 400);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            setCapturedBlob(blob);
            setPreviewUrl(URL.createObjectURL(blob));
            stopCamera();
          }
        },
        "image/jpeg",
        0.95
      );
    }
  };

  const handleRetake = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setCapturedBlob(null);

    // Restart camera
    setPermissionState("loading");
    navigator.mediaDevices
      .getUserMedia({
        video: { width: 480, height: 480, facingMode: facingMode },
        audio: false,
      })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setPermissionState("granted");
      })
      .catch((err) => {
        console.error("Camera access failed on retake:", err);
        setPermissionState("denied");
      });
  };

  const handleSave = () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], "member_snap.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    onCapture(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    onClose();
  };

  const handleClose = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Capture Member Photo
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={handleClose}
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Video stream viewport */}
        <div className="relative aspect-square w-full max-w-[320px] mx-auto rounded-2xl overflow-hidden border bg-black shadow-inner flex items-center justify-center">
          
          {/* Snap flash effect overlay */}
          {isFlashing && (
            <div className="absolute inset-0 bg-white z-30" style={{ animation: "flash 0.15s ease-out" }} />
          )}

          {/* Captured snap preview */}
          {previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewUrl}
              alt="Captured preview"
              className="h-full w-full object-cover z-10"
            />
          ) : permissionState === "granted" ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
              />
              {/* Circular alignment guide */}
              <div className="absolute inset-0 border-2 border-dashed border-white/60 rounded-full m-8 pointer-events-none z-20 flex items-center justify-center">
                <span className="text-[11px] text-white/50 font-medium tracking-widest uppercase bg-black/40 px-2 py-0.5 rounded-full">
                  Align Face
                </span>
              </div>
            </>
          ) : permissionState === "loading" ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs">Accessing webcam...</p>
            </div>
          ) : (
            <div className="text-center p-4 space-y-3">
              <p className="text-sm text-destructive font-medium">Camera Access Blocked</p>
              <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">
                Camera permission was denied. On mobile, check your browser settings &gt; Site Settings &gt; Camera and allow access for this site.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2"
              >
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                Use Device Camera (Fallback)
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onCapture(file);
                    onClose();
                  }
                }}
                className="hidden"
              />
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="flex justify-center gap-3 mt-6">
          {previewUrl ? (
            <>
              <Button variant="outline" onClick={handleRetake} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Retake
              </Button>
              <Button onClick={handleSave} className="gap-2">
                <Check className="h-4 w-4" />
                Use Photo
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                disabled={permissionState !== "granted"}
                onClick={() => {
                  setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
                }}
                className="gap-2"
                title="Switch camera"
              >
                <SwitchCamera className="h-4 w-4" />
              </Button>
              <Button
                disabled={permissionState !== "granted"}
                onClick={handleCapture}
                className="gap-2"
              >
                <Camera className="h-4 w-4" />
                Capture Snap
              </Button>
            </>
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes flash {
          0% { opacity: 0.9; }
          100% { opacity: 0; }
        }
      ` }} />
    </div>
  );
}
