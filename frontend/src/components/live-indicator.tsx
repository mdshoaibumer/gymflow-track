"use client";

import { cn } from "@/lib/utils";

interface LiveIndicatorProps {
  className?: string;
  label?: string;
  pulse?: boolean;
}

/**
 * Premium live status indicator with breathing dot animation.
 * Used on dashboard to indicate real-time data.
 */
export function LiveIndicator({ className, label = "Live", pulse = true }: LiveIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_hsl(142_71%_45%/0.4)]" />
      </span>
      <span className="text-2xs font-medium text-emerald-600 dark:text-emerald-400">
        {label}
      </span>
    </div>
  );
}
