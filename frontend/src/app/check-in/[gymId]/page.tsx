"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle, Dumbbell } from "lucide-react";

/**
 * Self-Service Check-In Page
 *
 * Public page (no auth) — members scan the gym's QR code and land here.
 * They enter their name, phone, or email to mark attendance.
 *
 * URL: /check-in/{gymId}?code={rotating_code}
 *
 * Security:
 * - The rotating code in the URL proves the member is physically at the gym
 * - Code expires within ~2 minutes
 * - No sensitive data exposed
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type CheckInState = "idle" | "loading" | "success" | "error";

interface SuccessData {
  member_name: string;
  message: string;
}

export default function SelfCheckInPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const gymId = params.gymId as string;
  const code = searchParams.get("code") || "";

  const [identifier, setIdentifier] = useState("");
  const [state, setState] = useState<CheckInState>("idle");
  const [error, setError] = useState("");
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [gymName, setGymName] = useState<string>("");

  // Fetch gym name on mount
  useEffect(() => {
    if (!gymId) return;
    fetch(`${API_URL}/gym-display/${gymId}/qr-data`)
      .then((res) => res.json())
      .then((data) => {
        if (data.gym_name) setGymName(data.gym_name);
      })
      .catch(() => {
        // Non-critical — gym name is just for display
      });
  }, [gymId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = identifier.trim();
    if (!trimmed) {
      setError("Please enter your name, phone number, or email.");
      return;
    }

    if (!code) {
      setError("Invalid QR code. Please scan the QR code at the gym again.");
      return;
    }

    setState("loading");
    setError("");

    try {
      const response = await fetch(`${API_URL}/gym-display/${gymId}/self-check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmed, code }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const detail = data?.detail || "Check-in failed. Please try again.";
        setState("error");
        setError(detail);
        return;
      }

      const data = await response.json();
      setState("success");
      setSuccessData({
        member_name: data.member_name,
        message: data.message,
      });
    } catch {
      setState("error");
      setError("Network error. Please check your connection and try again.");
    }
  };

  // Success screen
  if (state === "success" && successData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-green-950 dark:to-gray-900 flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
            <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-green-800 dark:text-green-200">
              Attendance Marked!
            </h1>
            <p className="mt-2 text-lg text-gray-700 dark:text-gray-300">
              Welcome, <span className="font-semibold">{successData.member_name}</span>!
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {successData.message}
            </p>
          </div>
          {gymName && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {gymName}
            </p>
          )}
          <button
            onClick={() => {
              setState("idle");
              setIdentifier("");
              setSuccessData(null);
            }}
            className="text-sm text-green-600 dark:text-green-400 underline hover:no-underline"
          >
            Check in another member
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Dumbbell className="h-7 w-7 text-primary" />
          </div>
          {gymName && (
            <p className="text-sm font-medium text-muted-foreground">{gymName}</p>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Mark Your Attendance
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter your registered name, phone number, or email
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (error) setError("");
              }}
              placeholder="Phone, Name, or Email"
              autoFocus
              autoComplete="off"
              className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={state === "loading"}
            className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {state === "loading" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Checking in...
              </>
            ) : (
              "Check In"
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Use the same details you registered with at the gym
        </p>

        {!code && (
          <div className="flex items-start gap-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              No code detected. Please scan the QR code displayed at your gym.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
