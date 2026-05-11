"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { QrCode, UserCheck, Search, AlertCircle, RefreshCw, CalendarCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  useAttendanceToday,
  useAttendanceStats,
  useCheckInQR,
  useCheckInManual,
  useCheckOut,
} from "@/hooks/use-attendance";
import { useMembers } from "@/hooks/use-members";
import { DashboardCard } from "@/components/layout/dashboard-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_VARIANTS: Record<string, "success" | "secondary" | "outline"> = {
  checked_in: "success",
  checked_out: "secondary",
  cancelled: "outline",
};

export default function AttendancePage() {
  const { user } = useAuth();
  const [qrInput, setQrInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const qrInputRef = useRef<HTMLInputElement>(null);

  const { data: todayData, isLoading: todayLoading, isError: todayError, refetch: todayRefetch } = useAttendanceToday();
  const { data: stats } = useAttendanceStats();
  const { data: searchData } = useMembers({
    search: debouncedSearch || undefined,
    limit: 5,
  });

  const checkInQR = useCheckInQR();
  const checkInManual = useCheckInManual();
  const checkOut = useCheckOut();

  const todayList = todayData?.attendance ?? [];
  const searchResults = debouncedSearch.length >= 2 ? (searchData?.members ?? []) : [];

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-focus QR input
  useEffect(() => {
    qrInputRef.current?.focus();
  }, []);

  const handleQRScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrInput.trim()) return;
    await checkInQR.mutateAsync(qrInput.trim());
    setQrInput("");
    qrInputRef.current?.focus();
  };

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Daily attendance tracking. Search members to mark check-in.
        </p>
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
        {/* QR Scanner Input - Hidden until QR hardware/portal is ready
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-5 w-5 text-primary" />
              QR Check-In
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Scan a member&apos;s QR code or paste the token below.
            </p>
            <form onSubmit={handleQRScan} className="flex gap-2">
              <Input
                ref={qrInputRef}
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Scan QR code here..."
                disabled={checkInQR.isPending}
                aria-label="QR code token"
                autoFocus
              />
              <Button
                type="submit"
                disabled={checkInQR.isPending || !qrInput.trim()}
              >
                {checkInQR.isPending ? "..." : "Check In"}
              </Button>
            </form>
          </CardContent>
        </Card>
        */}

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
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Member</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Time</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {todayList.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30 transition-colors">
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
                        className="h-7 text-xs"
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
