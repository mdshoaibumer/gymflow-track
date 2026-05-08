"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  onboardingService,
  type OnboardingStatus,
  type ImportPreview,
} from "@/services/onboarding.service";

type Step = "welcome" | "members" | "explore" | "done";

export default function SetupPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoResult, setDemoResult] = useState<{ members_created: number } | null>(null);

  useEffect(() => {
    if (!token) return;
    onboardingService
      .getStatus(token)
      .then((s) => {
        setStatus(s);
        if (s.onboarding_complete) setStep("done");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const handleDemoData = async () => {
    if (!token) return;
    setActionLoading(true);
    setError(null);
    try {
      const result = await onboardingService.seedDemoData(token);
      setDemoResult(result);
      setStep("explore");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load demo data");
    } finally {
      setActionLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportPreview(null);
      setImportResult(null);
      setError(null);
    }
  };

  const handlePreview = async () => {
    if (!token || !importFile) return;
    setActionLoading(true);
    setError(null);
    try {
      const preview = await onboardingService.previewImport(token, importFile);
      setImportPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview file");
    } finally {
      setActionLoading(false);
    }
  };

  const handleImport = async () => {
    if (!token || !importFile) return;
    setActionLoading(true);
    setError(null);
    try {
      const result = await onboardingService.commitImport(token, importFile);
      setImportResult(result);
      if (result.imported > 0) {
        setStep("explore");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-2">
        {(["welcome", "members", "explore", "done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : (["welcome", "members", "explore", "done"].indexOf(step) > i)
                  ? "bg-green-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {["welcome", "members", "explore", "done"].indexOf(step) > i ? "✓" : i + 1}
            </div>
            {i < 3 && <div className="mx-2 h-0.5 w-8 bg-muted" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Welcome */}
      {step === "welcome" && (
        <div className="space-y-6 text-center">
          <div>
            <h1 className="text-2xl font-bold">
              Welcome to GymFlow{status?.gym_name ? `, ${status.gym_name}` : ""}! 🎉
            </h1>
            <p className="mt-2 text-muted-foreground">
              Let&apos;s get your gym set up in under 10 minutes.
            </p>
          </div>

          <div className="rounded-lg border p-6 text-left space-y-3">
            <h2 className="font-semibold">Here&apos;s what we&apos;ll do:</h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-green-500">①</span>
                <span>Add your members (import from Excel/CSV or add manually)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-green-500">②</span>
                <span>Explore your dashboard — see attendance, payments, and reminders</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-green-500">③</span>
                <span>Start using GymFlow daily for check-ins and member management</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setStep("members")}
            className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Let&apos;s Get Started →
          </button>
        </div>
      )}

      {/* Step 2: Add Members */}
      {step === "members" && (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-bold">Add Your Members</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose how you&apos;d like to add members to GymFlow.
            </p>
          </div>

          {/* Option A: CSV Import */}
          <div className="rounded-lg border p-5 space-y-3">
            <h3 className="font-semibold">📁 Import from CSV / Excel</h3>
            <p className="text-sm text-muted-foreground">
              Have a spreadsheet? Export it as CSV and upload here.
              We&apos;ll match columns automatically.
            </p>
            <p className="text-xs text-muted-foreground">
              Required columns: <strong>name</strong>, <strong>phone</strong>.
              Optional: email, plan, start_date, end_date.
            </p>

            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="text-sm"
              />
              {importFile && !importPreview && (
                <button
                  onClick={handlePreview}
                  disabled={actionLoading}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {actionLoading ? "Reading..." : "Preview"}
                </button>
              )}
            </div>

            {/* Import Preview */}
            {importPreview && (
              <div className="space-y-3 rounded-md bg-muted/50 p-4">
                <div className="flex gap-4 text-sm">
                  <span className="text-green-700">✓ {importPreview.valid} valid</span>
                  {importPreview.duplicates > 0 && (
                    <span className="text-yellow-700">⚠ {importPreview.duplicates} duplicates</span>
                  )}
                  {importPreview.invalid > 0 && (
                    <span className="text-red-700">✗ {importPreview.invalid} invalid</span>
                  )}
                </div>

                {importPreview.rows.length > 0 && (
                  <div className="max-h-40 overflow-y-auto text-xs">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-1">Name</th>
                          <th className="py-1">Phone</th>
                          <th className="py-1">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.rows.slice(0, 20).map((row) => (
                          <tr key={row.row_number} className="border-b border-muted">
                            <td className="py-1">{row.name}</td>
                            <td className="py-1">{row.phone}</td>
                            <td className="py-1">
                              <span
                                className={
                                  row.status === "valid"
                                    ? "text-green-600"
                                    : row.status === "duplicate"
                                    ? "text-yellow-600"
                                    : "text-red-600"
                                }
                              >
                                {row.status}
                                {row.errors.length > 0 && `: ${row.errors[0]}`}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.rows.length > 20 && (
                      <p className="mt-1 text-muted-foreground">
                        ...and {importPreview.rows.length - 20} more rows
                      </p>
                    )}
                  </div>
                )}

                {importPreview.valid > 0 && (
                  <button
                    onClick={handleImport}
                    disabled={actionLoading}
                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {actionLoading ? "Importing..." : `Import ${importPreview.valid} Members`}
                  </button>
                )}
              </div>
            )}

            {/* Import Result */}
            {importResult && (
              <div className="rounded-md bg-green-50 p-4 text-sm text-green-800">
                ✓ {importResult.imported} members imported successfully!
              </div>
            )}
          </div>

          {/* Option B: Demo Data */}
          <div className="rounded-lg border border-dashed p-5 space-y-3">
            <h3 className="font-semibold">🎮 Try with Demo Data</h3>
            <p className="text-sm text-muted-foreground">
              Want to explore first? We&apos;ll add 15 realistic sample members,
              payments, and equipment. You can delete them later.
            </p>
            <button
              onClick={handleDemoData}
              disabled={actionLoading}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              {actionLoading ? "Loading..." : "Load Demo Data"}
            </button>
            {demoResult && (
              <p className="text-sm text-green-600">
                ✓ Added {demoResult.members_created} members with payments and equipment!
              </p>
            )}
          </div>

          {/* Option C: Skip */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep("welcome")}
              className="text-sm text-muted-foreground hover:underline"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep("explore")}
              className="text-sm text-muted-foreground hover:underline"
            >
              Skip — I&apos;ll add members later →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Explore */}
      {step === "explore" && (
        <div className="space-y-6 text-center">
          <div>
            <h1 className="text-xl font-bold">You&apos;re All Set! 🚀</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your gym is ready. Here&apos;s what to explore:
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => router.push("/members")}
              className="rounded-lg border p-4 text-left hover:bg-accent transition-colors"
            >
              <p className="font-medium">👥 Members</p>
              <p className="text-xs text-muted-foreground">View, search, and manage your members</p>
            </button>
            <button
              onClick={() => router.push("/attendance")}
              className="rounded-lg border p-4 text-left hover:bg-accent transition-colors"
            >
              <p className="font-medium">✅ Attendance</p>
              <p className="text-xs text-muted-foreground">Check in members by name or QR code</p>
            </button>
            <button
              onClick={() => router.push("/payments")}
              className="rounded-lg border p-4 text-left hover:bg-accent transition-colors"
            >
              <p className="font-medium">💰 Payments</p>
              <p className="text-xs text-muted-foreground">Record payments and track renewals</p>
            </button>
            <button
              onClick={() => router.push("/equipment")}
              className="rounded-lg border p-4 text-left hover:bg-accent transition-colors"
            >
              <p className="font-medium">🏋️ Equipment</p>
              <p className="text-xs text-muted-foreground">Track machines and maintenance</p>
            </button>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-medium">💡 Quick tip for daily use</p>
            <p className="mt-1">
              Open the <strong>Attendance</strong> page on your reception desk computer or tablet.
              Members can be checked in with one click!
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Dashboard →
          </button>
        </div>
      )}

      {/* Step 4: Done (returning user) */}
      {step === "done" && (
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-bold">Welcome Back! 👋</h1>
          <p className="text-sm text-muted-foreground">
            Your gym has {status?.member_count} members. Everything is set up.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => router.push("/members")}
              className="rounded-md border px-6 py-3 text-sm hover:bg-accent"
            >
              View Members
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
