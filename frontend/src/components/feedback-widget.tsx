/**
 * @file feedback-widget.tsx
 * @description Floating feedback button and panel for collecting user
 *              feedback. Positioned above mobile nav to avoid overlap.
 * @author Mohammed Shoaib U
 * @module components/feedback-widget
 */

"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { onboardingService } from "@/services/onboarding.service";
import { usePathname } from "next/navigation";

const CATEGORIES = [
  { value: "bug" as const, label: "🐛 Bug", description: "Something is broken" },
  { value: "friction" as const, label: "😤 Confusing", description: "Hard to use" },
  { value: "feature" as const, label: "💡 Feature", description: "I wish it could..." },
  { value: "general" as const, label: "💬 General", description: "Other feedback" },
];

export function FeedbackWidget() {
  const { token } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<"bug" | "feature" | "friction" | "general">("general");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || message.trim().length < 5) return;

    setSending(true);
    setError(null);
    try {
      await onboardingService.submitFeedback({
        category,
        message: message.trim(),
        page: pathname,
      });
      setSent(true);
      setMessage("");
      setTimeout(() => {
        setOpen(false);
        setSent(false);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-[calc(68px+1rem)] md:bottom-6 right-4 md:right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        aria-label={open ? "Close feedback form" : "Open feedback form"}
      >
        {open ? "✕" : "💬"}
      </button>

      {/* Feedback panel */}
      {open && (
        <div className="fixed bottom-[calc(68px+4.5rem)] md:bottom-20 right-4 md:right-6 z-40 w-[calc(100%-2rem)] sm:w-80 max-w-80 rounded-lg border bg-background shadow-xl">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold text-sm">Send Feedback</h3>
            <p className="text-xs text-muted-foreground">Help us improve GymFlow Track</p>
          </div>

          {sent ? (
            <div className="p-6 text-center">
              <p className="text-2xl">🙏</p>
              <p className="mt-2 text-sm font-medium">Thank you!</p>
              <p className="text-xs text-muted-foreground">Your feedback helps us improve.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 p-4">
              {/* Category picker */}
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`rounded-md border px-2 py-1.5 text-xs text-left transition-colors ${
                      category === c.value
                        ? "border-primary bg-primary/10"
                        : "hover:bg-accent"
                    }`}
                  >
                    <span className="block font-medium">{c.label}</span>
                    <span className="text-muted-foreground">{c.description}</span>
                  </button>
                ))}
              </div>

              {/* Message */}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what happened..."
                rows={3}
                maxLength={2000}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}

              <button
                type="submit"
                disabled={sending || message.trim().length < 5}
                className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send Feedback"}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
