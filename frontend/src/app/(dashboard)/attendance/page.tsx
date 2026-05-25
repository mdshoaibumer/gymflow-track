"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { UserCheck, Search, AlertCircle, RefreshCw, CalendarCheck, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/hooks/use-auth";
import {
  useAttendanceToday,
  useAttendanceStats,
  useCheckInManual,
  useCheckOut,
} from "@/hooks/use-attendance";
import { useMembers } from "@/hooks/use-members";
import { useAuthStore } from "@/store/auth-store";
import { DashboardCard } from "@/components/layout/dashboard-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FeatureGate } from "@/components/subscription/feature-gate";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const STATUS_VARIANTS: Record<string, "success" | "secondary" | "outline"> = {
  checked_in: "success",
  checked_out: "secondary",
  cancelled: "outline",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface QRDisplayData {
  gym_name: string;
  code: string;
  whatsapp_url?: string;
  checkin_url?: string;
  refresh_in_seconds: number;
  message: string;
}

function AttendanceQRDialog() {
  const user = useAuthStore((s) => s.user);
  const gymId = user?.gym_id;
  const [data, setData] = useState<QRDisplayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [open, setOpen] = useState(false);

  const fetchQRData = useCallback(async () => {
    if (!gymId) return;
    try {
      const response = await fetch(`${API_URL}/gym-display/${gymId}/qr-data`);
      if (!response.ok) throw new Error(`Failed to fetch QR data: ${response.statusText}`);
      const result: QRDisplayData = await response.json();
      setData(result);
      setTimeLeft(result.refresh_in_seconds);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load QR code");
    }
  }, [gymId]);

  useEffect(() => {
    if (!open) return;
    fetchQRData();
    const interval = setInterval(fetchQRData, 30_000);
    return () => clearInterval(interval);
  }, [open, fetchQRData]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 30));
    }, 1000);
    return () => clearInterval(timer);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <QrCode className="h-4 w-4" />
          Generate QR
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Attendance QR Code</DialogTitle>
          <DialogDescription>Members scan this QR to check in</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {error ? (
            <div className="text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={fetchQRData}>
                <RefreshCw className="mr-1 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : !data ? (
            <div className="flex flex-col items-center gap-3">
              <Skeleton className="h-48 w-48 rounded" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-white p-4">
                <QRCodeSVG value={`${window.location.origin}/check-in/${gymId}?code=${data.code}`} size={200} level="M" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-2xl font-mono font-bold tracking-widest">{data.code}</p>
                <p className="text-xs text-muted-foreground">
                  Code refreshes in {timeLeft}s
                </p>
              </div>
              <div className="w-full rounded-md bg-muted p-3">
                <p className="text-xs text-center text-muted-foreground">
                  Display this on a TV/tablet at the entrance, or use the full-screen display at{" "}
                  <code className="text-primary">/gym-display?gymId={gymId}</code>
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AttendancePage() {
  return (
    <FeatureGate feature="qr_attendance">
      <AttendanceContent />
    </FeatureGate>
  );
}

function AttendanceContent() {
  useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data: todayData, isLoading: todayLoading, isError: todayError, refetch: todayRefetch } = useAttendanceToday();
  const { data: stats } = useAttendanceStats();
  const { data: searchData } = useMembers({
    search: debouncedSearch || undefined,
    limit: 5,
  });

  const checkInManual = useCheckInManual();
  const checkOut = useCheckOut();

  const todayList = todayData?.attendance ?? [];
  const searchResults = debouncedSearch.length >= 2 ? (searchData?.members ?? []) : [];

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleManualCheckIn = async (memberId: string) => {
    await checkInManual.mutateAsync(memberId);
    setSearchQuery("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-subtle">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            Daily attendance tracking. Search members to mark check-in.
          </p>
        </div>
        <AttendanceQRDialog />
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <DashboardCard
            title="Checked In Today"
            value={String(stats.checked_in_today)}
            description="Total check-ins"
            icon={UserCheck}
          />
          <DashboardCard
            title="Currently In Gym"
            value={String(stats.currently_in_gym)}
            description="Active right now"
          />
          <DashboardCard
            title="This Week"
            value={String(stats.total_this_week)}
            description="Total visits"
          />
        </div>
      )}

      {/* Check-In Section */}
      <div className="max-w-2xl">
        {/* Manual Check-In */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-5 w-5 text-primary" />
              Manual Check-In
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Search by name or phone for walk-in check-in.
            </p>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search member name or phone..."
              disabled={checkInManual.isPending}
              aria-label="Search members for check-in"
            />
            {searchResults.length > 0 && (
              <div className="mt-2 divide-y rounded-md border">
                {searchResults.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.phone}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleManualCheckIn(m.id)}
                      disabled={checkInManual.isPending || m.membership_status !== "active"}
                    >
                      {m.membership_status !== "active"
                        ? m.membership_status
                        : "Check In"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Today's Attendance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Today&apos;s Attendance ({todayList.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {todayError ? (
            <div className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="h-6 w-6 text-destructive mb-2" />
              <p className="text-sm font-medium">Failed to load attendance</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => todayRefetch()}>
                <RefreshCw className="mr-1 h-3 w-3" />
                Retry
              </Button>
            </div>
          ) : todayLoading ? (
            <div className="space-y-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-0">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : todayList.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CalendarCheck}
                title="No check-ins today"
                description="Members can scan their QR code or check in at the front desk to appear here."
                className="border-0 bg-transparent min-h-[200px]"
              />
            </div>
          ) : (
            <>
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-sm" role="table">
                <caption className="sr-only">Today&apos;s attendance records</caption>
                <thead className="bg-muted/30 dark:bg-muted/15">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Member</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Time</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {todayList.map((a) => (
                    <tr key={a.id} className="hover:bg-primary/[0.02] dark:hover:bg-primary/[0.04] transition-colors duration-150">
                      <td className="px-4 py-3">
                        <p className="font-medium">{a.member_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{a.member_phone || "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.check_in_at
                          ? new Date(a.check_in_at).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="capitalize">
                          {a.source || "—"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANTS[a.status] || "secondary"}>
                          {a.status === "checked_in" ? "In Gym" : a.status === "checked_out" ? "Left" : "Cancelled"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {a.status === "checked_in" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => checkOut.mutate(a.id)}
                            disabled={checkOut.isPending}
                          >
                            Check Out
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards for attendance */}
            <div className="space-y-3 p-4 md:hidden">
              {todayList.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{a.member_name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.check_in_at
                        ? new Date(a.check_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                        : "—"}
                      {" · "}
                      <span className="capitalize">{a.source || "—"}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={STATUS_VARIANTS[a.status] || "secondary"} className="text-xs">
                      {a.status === "checked_in" ? "In" : a.status === "checked_out" ? "Left" : "—"}
                    </Badge>
                    {a.status === "checked_in" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs"
                        onClick={() => checkOut.mutate(a.id)}
                        disabled={checkOut.isPending}
                      >
                        Out
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
