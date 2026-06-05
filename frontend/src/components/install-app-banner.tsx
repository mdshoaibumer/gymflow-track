"use client";

import { useState } from "react";
import { Download, X } from "lucide-react";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

/**
 * Install App banner — shown to mobile users who haven't installed yet.
 * Dismissable with a "don't show again" localStorage flag.
 */
export function InstallAppBanner() {
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return sessionStorage.getItem("pwa-install-dismissed") === "true";
  });

  // Don't show if: already installed, not installable, or user dismissed
  if (isInstalled || !isInstallable || dismissed) return null;

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (!accepted) {
      // User declined — don't nag again for this session
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("pwa-install-dismissed", "true");
  };

  return (
    <div className="mx-4 mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-soft animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 rounded-lg bg-primary/10 p-2">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Install GymFlow App
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add to your home screen for quick access — works offline too!
          </p>
          <button
            onClick={handleInstall}
            className="mt-2.5 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-soft hover:bg-primary/90 active:scale-[0.97] transition-all"
          >
            Install App
          </button>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
