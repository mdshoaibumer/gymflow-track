"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  Users,
  CreditCard,
  CalendarCheck,
  FileSpreadsheet,
  TrendingUp,
  IndianRupee,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDashboardMetrics } from "@/hooks/use-payments";
import { useAttendanceStats } from "@/hooks/use-attendance";
import { API_URL } from "@/lib/api";
import { formatPaise } from "@/lib/utils";
import { DashboardCard } from "@/components/layout/dashboard-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function monthAgoStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split("T")[0];
}

export default function ReportsPage() {
  const { isAdminOrAbove } = useAuth();
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { data: attendanceStats } = useAttendanceStats();

  const [memberSearch, setMemberSearch] = useState("");
  const [paymentDateFrom, setPaymentDateFrom] = useState(monthAgoStr);
  const [paymentDateTo, setPaymentDateTo] = useState(todayStr);
  const [attendanceDateFrom, setAttendanceDateFrom] = useState(monthAgoStr);
  const [attendanceDateTo, setAttendanceDateTo] = useState(todayStr);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function downloadCsv(
    endpoint: string,
    filename: string,
    params?: Record<string, string>,
  ) {
    setDownloading(endpoint);
    try {
      const url = new URL(`${API_URL}/reports${endpoint}`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v) url.searchParams.set(k, v);
        });
      }
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Export failed (${resp.status})`);
      }
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success(`${filename} downloaded`);
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          View key metrics and export data as CSV.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Total Members"
          value={String(metrics?.total_members ?? 0)}
          description="Registered members"
          icon={Users}
          loading={metricsLoading}
        />
        <DashboardCard
          title="Active Members"
          value={String(metrics?.active_members ?? 0)}
          description="Currently active"
          icon={TrendingUp}
          loading={metricsLoading}
        />
        <DashboardCard
          title="Revenue (Month)"
          value={formatPaise(metrics?.monthly_revenue_paise ?? 0)}
          description="Current month"
          icon={IndianRupee}
          loading={metricsLoading}
        />
        <DashboardCard
          title="Checked In Today"
          value={String(attendanceStats?.checked_in_today ?? 0)}
          description="Today's attendance"
          icon={CalendarCheck}
        />
      </div>

      {/* Export Cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Members Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-primary" />
              Members Report
            </CardTitle>
            <CardDescription>
              Export your full member list with plans and status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="text"
              placeholder="Filter by name or phone (optional)"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              aria-label="Filter members for export"
            />
            <Button
              className="w-full"
              disabled={!isAdminOrAbove || downloading === "/members/csv"}
              onClick={() =>
                downloadCsv(
                  "/members/csv",
                  `members_${todayStr()}.csv`,
                  memberSearch ? { search: memberSearch } : undefined,
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              {downloading === "/members/csv" ? "Downloading…" : "Export Members CSV"}
            </Button>
          </CardContent>
        </Card>

        {/* Payments Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5 text-primary" />
              Payments Report
            </CardTitle>
            <CardDescription>
              Export payment records with date range filter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">From</label>
                <Input
                  type="date"
                  value={paymentDateFrom}
                  onChange={(e) => setPaymentDateFrom(e.target.value)}
                  aria-label="Payment date from"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">To</label>
                <Input
                  type="date"
                  value={paymentDateTo}
                  onChange={(e) => setPaymentDateTo(e.target.value)}
                  aria-label="Payment date to"
                />
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!isAdminOrAbove || downloading === "/payments/csv"}
              onClick={() =>
                downloadCsv("/payments/csv", `payments_${todayStr()}.csv`, {
                  date_from: paymentDateFrom,
                  date_to: paymentDateTo,
                })
              }
            >
              <Download className="mr-2 h-4 w-4" />
              {downloading === "/payments/csv" ? "Downloading…" : "Export Payments CSV"}
            </Button>
          </CardContent>
        </Card>

        {/* Attendance Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="h-5 w-5 text-primary" />
              Attendance Report
            </CardTitle>
            <CardDescription>
              Export attendance history with date range filter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">From</label>
                <Input
                  type="date"
                  value={attendanceDateFrom}
                  onChange={(e) => setAttendanceDateFrom(e.target.value)}
                  aria-label="Attendance date from"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">To</label>
                <Input
                  type="date"
                  value={attendanceDateTo}
                  onChange={(e) => setAttendanceDateTo(e.target.value)}
                  aria-label="Attendance date to"
                />
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!isAdminOrAbove || downloading === "/attendance/csv"}
              onClick={() =>
                downloadCsv("/attendance/csv", `attendance_${todayStr()}.csv`, {
                  start_date: attendanceDateFrom,
                  end_date: attendanceDateTo,
                })
              }
            >
              <Download className="mr-2 h-4 w-4" />
              {downloading === "/attendance/csv"
                ? "Downloading…"
                : "Export Attendance CSV"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
