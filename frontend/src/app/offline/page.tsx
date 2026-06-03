"use client";

import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md space-y-6">
        {/* Offline icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-muted flex items-center justify-center">
          <svg
            className="w-10 h-10 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 3l18 18M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0"
            />
            <line x1="3" y1="3" x2="21" y2="21" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold font-display text-foreground">
          You&apos;re Offline
        </h1>

        <p className="text-muted-foreground text-sm leading-relaxed">
          It looks like you&apos;ve lost your internet connection. Check your Wi-Fi or mobile data and try again.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-soft hover:bg-primary/90 active:scale-[0.97] transition-all"
          >
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
