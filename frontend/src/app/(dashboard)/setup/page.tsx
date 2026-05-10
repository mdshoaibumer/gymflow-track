"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Gamepad2, ArrowRight, ArrowLeft, Users, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  onboardingService,
  type OnboardingStatus,
  type ImportPreview,
} from "@/services/onboarding.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type Step = "welcome" | "members" | "explore" | "done";

const STEPS: Step[] = ["welcome", "members", "explore", "done"];

export default function SetupPage() {
  const { token, user, isOwner, isAdminOrAbove, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Role-based route protection
  useEffect(() => {
    if (!authLoading && !isAdminOrAbove) {
      router.replace("/dashboard");
    }
  }, [isAdminOrAbove, authLoading, router]);

  const [step, setStep] = useState<Step>("welcome");
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);
  const [demoResult, setDemoResult] = useState<{ members_created: number } | null>(null);

  useEffect(() => {
    // Skip API call for unauthorized roles — prevents unnecessary fetch before redirect
    if (!token || !isAdminOrAbove) return;
    onboardingService
      .getStatus()
      .then((s) => {
        setStatus(s);
        if (s.onboarding_complete) setStep("done");
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load setup status");
      })
      .finally(() => setLoading(false));
  }, [token, isAdminOrAbove]);

  const handleDemoData = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      const result = await onboardingService.seedDemoData();
      setDemoResult(result);
      toast.success(`Added ${result.members_created} demo members!`);
      setStep("explore");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load demo data");
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
    }
  };

  const handlePreview = async () => {
    if (!token || !importFile) return;
    setActionLoading(true);
    try {
      const preview = await onboardingService.previewImport(importFile);
      setImportPreview(preview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to preview file");
    } finally {
      setActionLoading(false);
    }
  };

  const handleImport = async () => {
    if (!token || !importFile) return;
    setActionLoading(true);
    try {
      const result = await onboardingService.commitImport(importFile);
      setImportResult(result);
      if (result.imported > 0) {
        toast.success(`${result.imported} members imported!`);
        setStep("explore");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Render-gate: prevent unauthorized content flash during hydration
  if (authLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdminOrAbove) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentIdx = STEPS.indexOf(step);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : currentIdx > i
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {currentIdx > i ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            {i < 3 && <div className="mx-2 h-0.5 w-8 bg-muted" />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: Welcome */}
        {step === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6 text-center"
          >
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Welcome to GymFlow{status?.gym_name ? `, ${status.gym_name}` : ""}!
              </h1>
              <p className="mt-2 text-muted-foreground">
                Let&apos;s get your gym set up in under 10 minutes.
              </p>
            </div>

            <Card className="text-left">
              <CardHeader>
                <CardTitle className="text-base">Here&apos;s what we&apos;ll do:</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3 text-sm">
                  <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                  <span>Add your members (import from Excel/CSV or add manually)</span>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                  <span>Explore your dashboard — see attendance, payments, and reminders</span>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                  <span>Start using GymFlow daily for check-ins and member management</span>
                </div>
              </CardContent>
            </Card>

            <Button size="lg" onClick={() => setStep("members")}>
              Let&apos;s Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        )}

        {/* Step 2: Add Members */}
        {step === "members" && (
          <motion.div
            key="members"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center">
              <h1 className="text-xl font-bold tracking-tight">Add Your Members</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose how you&apos;d like to add members to GymFlow.
              </p>
            </div>

            {/* CSV Import */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Upload className="h-5 w-5 text-primary" />
                  Import from CSV / Excel
                </CardTitle>
                <CardDescription>
                  Export your spreadsheet as CSV. Required: <strong>name</strong>, <strong>phone</strong>.
                  Optional: email, plan, start_date, end_date.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
                  />
                  {importFile && !importPreview && (
                    <Button
                      size="sm"
                      onClick={handlePreview}
                      disabled={actionLoading}
                    >
                      {actionLoading ? "Reading..." : "Preview"}
                    </Button>
                  )}
                </div>

                {importPreview && (
                  <div className="space-y-3 rounded-md bg-muted/50 p-4">
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-600">✓ {importPreview.valid} valid</span>
                      {importPreview.duplicates > 0 && (
                        <span className="text-yellow-600">⚠ {importPreview.duplicates} duplicates</span>
                      )}
                      {importPreview.invalid > 0 && (
                        <span className="text-destructive">✗ {importPreview.invalid} invalid</span>
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
                                          : "text-destructive"
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
                      <Button
                        onClick={handleImport}
                        disabled={actionLoading}
                        variant="default"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {actionLoading ? "Importing..." : `Import ${importPreview.valid} Members`}
                      </Button>
                    )}
                  </div>
                )}

                {importResult && (
                  <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-4 text-sm text-green-800 dark:text-green-400">
                    ✓ {importResult.imported} members imported successfully!
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Demo Data */}
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gamepad2 className="h-5 w-5 text-primary" />
                  Try with Demo Data
                </CardTitle>
                <CardDescription>
                  Explore first with 15 realistic sample members, payments, and equipment.
                  You can delete them later.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={handleDemoData} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {actionLoading ? "Loading..." : "Load Demo Data"}
                </Button>
                {demoResult && (
                  <p className="mt-2 text-sm text-green-600">
                    ✓ Added {demoResult.members_created} members with payments and equipment!
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep("welcome")}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStep("explore")}>
                Skip — I&apos;ll add members later <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Explore */}
        {step === "explore" && (
          <motion.div
            key="explore"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6 text-center"
          >
            <div>
              <h1 className="text-xl font-bold tracking-tight">You&apos;re All Set!</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your gym is ready. Here&apos;s what to explore:
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { href: "/members", icon: "👥", title: "Members", desc: "View, search, and manage your members" },
                { href: "/attendance", icon: "✅", title: "Attendance", desc: "Check in members by name or QR code" },
                { href: "/payments", icon: "💰", title: "Payments", desc: "Record payments and track renewals" },
                { href: "/equipment", icon: "🏋️", title: "Equipment", desc: "Track machines and maintenance" },
              ].map((item) => (
                <Card
                  key={item.href}
                  className="cursor-pointer text-left hover:bg-accent transition-colors"
                  onClick={() => router.push(item.href)}
                >
                  <CardContent className="p-4">
                    <p className="font-medium">{item.icon} {item.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="p-4 text-sm text-blue-800 dark:text-blue-400">
                <p className="font-medium">💡 Quick tip for daily use</p>
                <p className="mt-1">
                  Open the <strong>Attendance</strong> page on your reception desk.
                  Members can be checked in with one click!
                </p>
              </CardContent>
            </Card>

            <Button size="lg" onClick={() => router.push("/dashboard")}>
              Go to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        )}

        {/* Step 4: Done (returning user) */}
        {step === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4 text-center"
          >
            <h1 className="text-xl font-bold tracking-tight">Welcome Back! 👋</h1>
            <p className="text-sm text-muted-foreground">
              Your gym has {status?.member_count} members. Everything is set up.
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={() => router.push("/dashboard")}>
                Go to Dashboard
              </Button>
              <Button variant="outline" onClick={() => router.push("/members")}>
                <Users className="mr-2 h-4 w-4" />
                View Members
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
