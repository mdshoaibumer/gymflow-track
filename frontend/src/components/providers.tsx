"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSyncExternalStore, type ReactNode } from "react";
import { getQueryClient } from "@/lib/query-client";

// SSR-safe mobile detection using useSyncExternalStore (no hydration mismatch)
function subscribeMobile(cb: () => void) {
  const mql = window.matchMedia("(max-width: 767px)");
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}
function getIsMobile() {
  return window.matchMedia("(max-width: 767px)").matches;
}
function getServerSnapshot() {
  return false; // Default to desktop during SSR
}
function useIsMobile() {
  return useSyncExternalStore(subscribeMobile, getIsMobile, getServerSnapshot);
}

export function Providers({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider delayDuration={300} skipDelayDuration={100}>
          {children}
        </TooltipProvider>
        <Toaster
          position={isMobile ? "bottom-center" : "top-right"}
          richColors
          closeButton
          duration={4000}
          toastOptions={{
            className: "text-sm font-medium shadow-soft-lg rounded-xl border border-border/60 backdrop-blur-xl",
            style: {
              padding: "14px 18px",
              gap: "12px",
            },
          }}
        />
        {/* Live region for screen readers to announce dynamic updates */}
        <div aria-live="polite" aria-atomic="true" className="sr-only" id="sr-announcements" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
