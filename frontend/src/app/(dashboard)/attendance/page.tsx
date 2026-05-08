"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  attendanceService,
  type AttendanceRecord,
  type AttendanceStats,
} from "@/services/attendance.service";
import { memberService, type Member } from "@/services/member.service";
import { DashboardCard } from "@/components/layout/dashboard-card";

const STATUS_COLORS: Record<string, string> = {
  checked_in: "bg-green-100 text-green-800",
  checked_out: "bg-blue-100 text-blue-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export default function AttendancePage() {
  const { token, user } = useAuth();
  const [todayList, setTodayList] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrInput, setQrInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [processing, setProcessing] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);

  const isAdminOrAbove = user?.role === "owner" || user?.role === "admin";

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [todayRes, statsRes] = await Promise.all([
        attendanceService.getToday(token),
        attendanceService.getStats(token),
      ]);
      setTodayList(todayRes.attendance);
      setStats(statsRes);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-focus QR input for scanner workflow
  useEffect(() => {
    qrInputRef.current?.focus();
  }, []);

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleQRScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !qrInput.trim() || processing) return;

    setProcessing(true);
    try {
      const result = await attendanceService.checkInByQR(token, qrInput.trim());
      showFeedback(
        "success",
        `✓ ${result.member_name || "Member"} checked in!`
      );
      setQrInput("");
      fetchData();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Check-in failed"
      );
    } finally {
      setProcessing(false);
      qrInputRef.current?.focus();
    }
  };

  const handleManualCheckIn = async (memberId: string) => {
    if (!token || processing) return;
    setProcessing(true);
    try {
      const result = await attendanceService.checkInManual(token, memberId);
      showFeedback(
        "success",
        `✓ ${result.member_name || "Member"} checked in (manual)`
      );
      setSearchQuery("");
      setSearchResults([]);
      fetchData();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Check-in failed"
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleCheckOut = async (attendanceId: string) => {
    if (!token) return;
    try {
      await attendanceService.checkOut(token, attendanceId);
      showFeedback("success", "Checked out");
      fetchData();
    } catch (err) {
      showFeedback(
        "error",
        err instanceof Error ? err.message : "Check-out failed"
      );
    }
  };

  // Member search for manual check-in
  useEffect(() => {
    if (!token || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await memberService.list(token, {
          search: searchQuery,
          limit: 5,
        });
        setSearchResults(res.members);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, token]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          QR check-in and daily attendance tracking.
        </p>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`rounded-md px-4 py-3 text-sm font-medium ${
            feedback.type === "success"
              ? "border border-green-200 bg-green-50 text-green-800"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <DashboardCard
            title="Checked In Today"
            value={String(stats.checked_in_today)}
            description="Total check-ins"
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
      <div className="grid gap-6 lg:grid-cols-2">
        {/* QR Scanner Input */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-3 text-lg font-semibold">QR Check-In</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Scan a member&apos;s QR code or paste the token below.
          </p>
          <form onSubmit={handleQRScan} className="flex gap-2">
            <input
              ref={qrInputRef}
              type="text"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="Scan QR code here..."
              className="flex-1 rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
              disabled={processing}
            />
            <button
              type="submit"
              disabled={processing || !qrInput.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {processing ? "..." : "Check In"}
            </button>
          </form>
        </div>

        {/* Manual Check-In */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-3 text-lg font-semibold">Manual Check-In</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Search by name or phone for walk-in check-in.
          </p>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search member name or phone..."
            className="w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={processing}
          />
          {searchResults.length > 0 && (
            <div className="mt-2 divide-y rounded-md border">
              {searchResults.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.phone}</p>
                  </div>
                  <button
                    onClick={() => handleManualCheckIn(m.id)}
                    disabled={processing || m.membership_status !== "active"}
                    className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {m.membership_status !== "active"
                      ? m.membership_status
                      : "Check In"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Today's Attendance Table */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Today&apos;s Attendance ({todayList.length})
        </h2>
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">
            Loading...
          </div>
        ) : todayList.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            No check-ins today yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Member</th>
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                  <th className="px-4 py-3 text-left font-medium">Source</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {todayList.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {a.member_name || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.member_phone || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(a.check_in_at).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                        {a.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status]}`}
                      >
                        {a.status === "checked_in"
                          ? "In Gym"
                          : a.status === "checked_out"
                            ? "Left"
                            : "Cancelled"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {a.status === "checked_in" && (
                        <button
                          onClick={() => handleCheckOut(a.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Check Out
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
