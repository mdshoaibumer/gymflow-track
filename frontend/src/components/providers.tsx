"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useState, useEffect, type ReactNode } from "react";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export function Providers({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
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
