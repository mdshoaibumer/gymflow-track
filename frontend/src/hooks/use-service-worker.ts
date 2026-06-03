"use client";

import { useEffect, useRef } from "react";

/**
 * Registers the service worker on mount.
 * Handles updates by posting SKIP_WAITING to the new SW.
 */
export function useServiceWorker() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV === "development"
    ) {
      return;
    }

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        registrationRef.current = registration;

        // Check for updates every 60 minutes
        const interval = setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        // When a new SW is waiting, activate it
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New version available — activate it silently
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        // Reload page when new SW takes over (seamless update)
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });

        return () => clearInterval(interval);
      } catch (error) {
        console.error("SW registration failed:", error);
      }
    };

    registerSW();
  }, []);

  return registrationRef;
}
