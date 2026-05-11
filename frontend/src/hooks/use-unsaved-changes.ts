"use client";

import { useEffect, useCallback, useRef } from "react";

/**
 * Hook that warns users about unsaved changes before leaving the page.
 *
 * Handles:
 * - Browser refresh / tab close (beforeunload event)
 * - Browser back/forward navigation (beforeunload event)
 *
 * Note: Next.js App Router does not support route-level navigation blocking
 * (no onBeforeRouteChange). The beforeunload event covers the most critical
 * data loss scenarios (refresh, close, external navigation).
 *
 * @param isDirty - Whether the form has unsaved changes
 */
export function useUnsavedChanges(isDirty: boolean) {
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (!isDirtyRef.current) return;
    e.preventDefault();
    // Modern browsers ignore custom messages but still show a generic prompt
    e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
  }, []);

  useEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [handleBeforeUnload]);
}
