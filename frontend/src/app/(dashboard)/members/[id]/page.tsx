"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Loader2, User, CreditCard, CalendarCheck, FileText,
  Download, Snowflake, Play, RefreshCw, Activity, TrendingUp,
  Flame, Clock, MoreHorizontal, HandCoins,
} from "lucide-react";
import { useMember, useMemberTimeline } from "@/hooks/use-members";
import { formatPaise } from "@/lib/utils";
import { useMemberPayments } from "@/hooks/use-payments";
import { useMemberDues } from "@/hooks/use-dues";
import { useMemberInvoices } from "@/hooks/use-invoices";
import { useMemberAttendance } from "@/hooks/use-attendance";
import { memberService } from "@/services/member.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { invoiceService } from "@/services/invoice.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhatsAppReminderButton } from "@/components/whatsapp/whatsapp-reminder-button";
import { MemberPhotoUpload } from "@/components/members/member-photo-upload";
import { MembershipOverrideForm } from "@/components/members/membership-override-form";
import { AttendanceHeatmap } from "@/components/members/attendance-heatmap";
import { RoleGate } from "@/components/role-gate";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const statusVariant: Record<string, "success" | "destructive" | "warning" | "secondary" | "outline"> = {
  active: "success",
  expired: "destructive",
  frozen: "warning",
  pending: "secondary",
  cancelled: "outline",
};

const statusColor: Record<string, string> = {
  active: "ring-emerald-500",
  expired: "ring-red-400",
  frozen: "ring-cyan-400",
  pending: "ring-gray-400",
  cancelled: "ring-gray-300",
};

const statusBorderColor: Record<string, string> = {
  active: "border-l-emerald-500",
  expired: "border-l-red-400",
  frozen: "border-l-cyan-400",
  pending: "border-l-gray-400",
  cancelled: "border-l-gray-300",
};

// --- Progress Ring SVG Component — Premium Fitness Style ---
function ProgressRing({ progress, size = 48, strokeWidth = 4 }: { progress: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(Math.max(progress, 0), 100) / 100) * circumference;

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <defs>
        <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={progress > 50 ? "#10b981" : progress > 20 ? "#f59e0b" : "#ef4444"} />
          <stop offset="100%" stopColor={progress > 50 ? "#34d399" : progress > 20 ? "#fbbf24" : "#f87171"} />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted/30"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#progress-gradient)"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeLinecap="round"
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      />
    </svg>
  );
}

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: member, isLoading } = useMember(id);
  const { data: paymentData } = useMemberPayments(id);
  const { data: invoiceData } = useMemberInvoices(id);
  const { data: attendanceData } = useMemberAttendance(id, 0, 50);
  const { data: timelineData } = useMemberTimeline(id);
  const { data: memberDues } = useMemberDues(id);
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"payments" | "attendance" | "invoices" | "timeline">("payments");
  const [showCustomFields, setShowCustomFields] = useState(false);

  // Computed stats
  const payments = paymentData?.payments ?? [];
  const invoices = invoiceData?.invoices ?? [];
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount_in_paise ?? 0), 0);
  const attendanceCount = attendanceData?.attendance?.length ?? 0;

  // Outstanding dues calculation
  const outstandingDues = useMemo(() => {
    if (!memberDues) return { count: 0, totalPaise: 0 };
    const pending = memberDues.filter(d => d.status === "pending" || d.status === "partial");
    return {
      count: pending.length,
      totalPaise: pending.reduce((sum, d) => sum + d.balance_paise, 0),
    };
  }, [memberDues]);

  // Membership progress calculation
  const membershipProgress = useMemo(() => {
    if (!member?.membership_start || !member?.membership_end) return 0;
    const start = new Date(member.membership_start).getTime();
    const end = new Date(member.membership_end).getTime();
    const now = Date.now();
    if (now >= end) return 0;
    if (now <= start) return 100;
    const total = end - start;
    const remaining = end - now;
    return Math.round((remaining / total) * 100);
  }, [member?.membership_start, member?.membership_end]);

  const daysRemaining = useMemo(() => {
    if (!member?.membership_end) return 0;
    const end = new Date(member.membership_end).getTime();
    const diff = end - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [member?.membership_end]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Member not found</p>
        <Button variant="outline" asChild>
          <Link href="/members">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Members
          </Link>
        </Button>
      </div>
    );
  }

  const tabs = [
    { key: "payments" as const, label: "Payments", count: payments.length, icon: CreditCard },
    { key: "attendance" as const, label: "Attendance", count: attendanceCount, icon: CalendarCheck },
    { key: "invoices" as const, label: "Invoices", count: invoices.length, icon: FileText },
    { key: "timeline" as const, label: "Timeline", count: timelineData?.events?.length ?? 0, icon: Activity },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* ═══════ HERO SECTION ═══════ */}
      <div className="relative">
        <Button variant="ghost" size="icon" className="absolute -left-1 -top-1 z-10" asChild>
          <Link href="/members">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>

        <Card className="overflow-hidden border-0 shadow-none bg-gradient-to-br from-card via-card to-muted/20 glass-premium">
          <CardContent className="p-6 pt-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              {/* Avatar with status ring + pulse for active */}
              <motion.div
                layoutId={`member-avatar-${member.id}`}
                className={cn(
                  "relative rounded-full ring-[3px] ring-offset-2 ring-offset-background",
                  statusColor[member.membership_status] ?? "ring-gray-400",
                  member.membership_status === "active" && "pulse-ring",
                )}
              >
                <MemberPhotoUpload memberId={member.id} photoUrl={member.photo_url} />
                {member.membership_status === "active" && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-background" />
                )}
              </motion.div>

              {/* Name + compact metadata */}
              <div className="flex-1 min-w-0">
                <motion.h1
                  layoutId={`member-name-${member.id}`}
                  className="text-2xl font-bold tracking-tight truncate"
                >
                  {member.name}
                </motion.h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {member.phone}
                  {member.email && <span> · {member.email}</span>}
                  {member.membership_plan && (
                    <span> · <span className="font-medium text-foreground/80">{member.membership_plan}</span></span>
                  )}
                </p>
              </div>

              {/* Status badge + Balance badge */}
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <Badge variant={statusVariant[member.membership_status] ?? "secondary"} className="capitalize text-xs">
                  {member.membership_status}
                </Badge>
                {outstandingDues.totalPaise > 0 && (
                  <Badge
                    variant="destructive"
                    className="text-xs font-semibold tabular-nums whitespace-nowrap"
                    data-testid="balance-badge"
                  >
                    {formatPaise(outstandingDues.totalPaise)} due
                  </Badge>
                )}
              </div>
            </div>

            {/* Actions row */}
            <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-border/50">
              <Button
                size="sm"
                onClick={() => router.push(`/payments?member_id=${member.id}`)}
                className="cursor-pointer"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Renew
              </Button>
              <WhatsAppReminderButton
                member={{
                  name: member.name,
                  phone: member.phone,
                  membership_end: member.membership_end,
                  membership_plan: member.membership_plan,
                  amount_due: member.amount_paid,
                }}
              />
              <RoleGate allowed={["owner", "admin"]}>
                <Button
                  size="sm"
                  variant={member.membership_status === "frozen" ? "default" : "outline"}
                  disabled={freezeLoading}
                  className="cursor-pointer"
                  onClick={async () => {
                    setFreezeLoading(true);
                    try {
                      const newStatus = member.membership_status === "frozen" ? "active" : "frozen";
                      await memberService.overrideMembership(member.id, { membership_status: newStatus });
                      queryClient.invalidateQueries({ queryKey: ["member", id] });
                      toast.success(`Member ${newStatus === "frozen" ? "frozen" : "unfrozen"} successfully`);
                    } catch {
                      toast.error("Failed to update membership status");
                    } finally {
                      setFreezeLoading(false);
                    }
                  }}
                >
                  {member.membership_status === "frozen" ? (
                    <><Play className="mr-1.5 h-3.5 w-3.5" /> Unfreeze</>
                  ) : (
                    <><Snowflake className="mr-1.5 h-3.5 w-3.5" /> Freeze</>
                  )}
                </Button>
              </RoleGate>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════ STATS ROW — BENTO FITNESS CARDS ═══════ */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        initial="hidden"
        animate="show"
        variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }}
      >
        {/* Days Remaining — with animated progress ring */}
        <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.95 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } } }}>
          <Card className="border fitness-card fitness-card-violet group hover:shadow-soft-md transition-all duration-300">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <ProgressRing progress={membershipProgress} size={48} strokeWidth={3.5} />
                <Clock className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground group-hover:text-violet-500 transition-colors duration-300" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold tabular-nums leading-none">{daysRemaining}</p>
                <p className="text-xs text-muted-foreground mt-1">Days Left</p>
                {member.membership_end && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {new Date(member.membership_end).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Total Paid — emerald accent */}
        <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.95 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } } }}>
          <Card className="border fitness-card fitness-card-emerald group hover:shadow-soft-md transition-all duration-300">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-2.5 flex-shrink-0 group-hover:bg-emerald-500/15 group-hover:scale-110 transition-all duration-300">
                <CreditCard className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold tabular-nums leading-none truncate">{formatPaise(totalPaid)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Paid</p>
                {payments.length > 0 && (
                  <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5 font-medium">
                    {payments.length} transaction{payments.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Attendance — blue accent with mini trend */}
        <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.95 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } } }}>
          <Card className="border fitness-card fitness-card-blue group hover:shadow-soft-md transition-all duration-300">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-2.5 flex-shrink-0 group-hover:bg-blue-500/15 group-hover:scale-110 transition-all duration-300">
                <TrendingUp className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold tabular-nums leading-none">{attendanceCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Visits</p>
                {attendanceCount > 0 && daysRemaining > 0 && (
                  <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70 mt-0.5 font-medium">
                    ~{Math.round(attendanceCount / Math.max(1, Math.ceil((Date.now() - new Date(member.membership_start || Date.now()).getTime()) / (1000 * 60 * 60 * 24 * 7))))}x/week
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Streak / Consistency — orange fire accent */}
        <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.95 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } } }}>
          <Card className="border fitness-card fitness-card-orange group hover:shadow-soft-md transition-all duration-300">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-xl bg-amber-500/10 p-2.5 flex-shrink-0 group-hover:bg-amber-500/15 group-hover:scale-110 transition-all duration-300">
                <Flame className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400 group-hover:animate-pulse" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold tabular-nums leading-none">{payments.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Payments</p>
                {member.membership_status === "active" && (
                  <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-0.5 font-medium flex items-center gap-0.5">
                    <span className="streak-flame">🔥</span> Active
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* ═══════ OUTSTANDING DUES ALERT ═══════ */}
      {outstandingDues.count > 0 && (
        <Link href="/collections">
          <Card className="border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 cursor-pointer hover:shadow-soft-md hover:-translate-y-0.5 transition-all duration-200">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                <HandCoins className="h-4.5 w-4.5 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-800 dark:text-red-400">
                  {formatPaise(outstandingDues.totalPaise)} Outstanding
                </p>
                <p className="text-xs text-red-700 dark:text-red-500 mt-0.5">
                  {outstandingDues.count} pending due{outstandingDues.count !== 1 ? "s" : ""} — tap to collect
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {/* ═══════ DETAIL CARDS (2 columns) — Premium Fitness Style ═══════ */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Personal Info Card */}
        <Card className="border fitness-card fitness-card-violet group hover:shadow-soft-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <div className="rounded-lg bg-violet-500/10 p-1.5 group-hover:bg-violet-500/15 transition-colors duration-300">
              <User className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <CardTitle className="text-sm font-medium">Personal Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <span className="text-muted-foreground">Gender</span>
              <span>{member.gender ? member.gender.charAt(0).toUpperCase() + member.gender.slice(1) : "—"}</span>
              <span className="text-muted-foreground">Date of Birth</span>
              <span>{member.date_of_birth ? new Date(member.date_of_birth).toLocaleDateString("en-IN") : "—"}</span>
              <span className="text-muted-foreground">Batch</span>
              <span>{member.batch ? member.batch.charAt(0).toUpperCase() + member.batch.slice(1) : "—"}</span>
              <span className="text-muted-foreground">Emergency</span>
              <span>{member.emergency_contact || "—"}</span>
            </div>

            {/* Attendance Heatmap — Fitness Signature */}
            {attendanceData?.attendance && attendanceData.attendance.length > 0 && (
              <div className="pt-3 border-t border-border/50">
                <AttendanceHeatmap attendance={attendanceData.attendance} weeks={8} />
              </div>
            )}
            {member.custom_fields && Object.keys(member.custom_fields).length > 0 && (
              <>
                <button
                  onClick={() => setShowCustomFields(!showCustomFields)}
                  className="text-xs text-primary hover:underline cursor-pointer mt-2 flex items-center gap-1"
                >
                  {showCustomFields ? "Hide" : "Show"} custom fields ({Object.keys(member.custom_fields).length})
                  <motion.span
                    animate={{ rotate: showCustomFields ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="inline-block"
                  >
                    ▼
                  </motion.span>
                </button>
                <AnimatePresence>
                  {showCustomFields && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 pt-2 border-t border-dashed">
                        {Object.entries(member.custom_fields).map(([key, value]) => (
                          <React.Fragment key={key}>
                            <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                            <span>{value ?? "—"}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </CardContent>
        </Card>

        {/* Membership Card with Timeline Bar — Premium */}
        <Card className={cn("border-l-4 fitness-card group hover:shadow-soft-md transition-all duration-300", statusBorderColor[member.membership_status] ?? "border-l-gray-300")}>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <div className="rounded-lg bg-primary/10 p-1.5 group-hover:bg-primary/15 transition-colors duration-300">
              <CalendarCheck className="h-3.5 w-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Membership</CardTitle>
            <Badge variant={statusVariant[member.membership_status] ?? "secondary"} className="capitalize text-[10px] ml-auto">
              {member.membership_status}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium">{member.membership_plan || "—"}</span>
              <span className="text-muted-foreground">Start</span>
              <span>{member.membership_start ? new Date(member.membership_start).toLocaleDateString("en-IN") : "—"}</span>
              <span className="text-muted-foreground">End</span>
              <span>{member.membership_end ? new Date(member.membership_end).toLocaleDateString("en-IN") : "—"}</span>
            </div>

            {/* Membership Timeline Bar — Premium Fitness Style */}
            {member.membership_start && member.membership_end && (
              <div className="pt-2">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span>{new Date(member.membership_start).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  <span className={cn(
                    "font-medium px-1.5 py-0.5 rounded-full text-[9px]",
                    daysRemaining > 14 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : daysRemaining > 0 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
                  )}>
                    {daysRemaining > 0 ? `${daysRemaining}d left` : "Expired"}
                  </span>
                  <span>{new Date(member.membership_end).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden progress-fitness">
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      membershipProgress > 50
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                        : membershipProgress > 20
                        ? "bg-gradient-to-r from-amber-500 to-amber-400"
                        : "bg-gradient-to-r from-red-500 to-red-400",
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${100 - membershipProgress}%` }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════ ANIMATED TABS ═══════ */}
      <div className="relative">
        <div className="flex gap-1 overflow-x-auto scrollbar-none border-b" role="tablist">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                className={cn(
                  "relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 min-h-[44px]",
                  activeTab === tab.key ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setActiveTab(tab.key)}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn(
                    "text-[10px] rounded-full px-1.5 py-0.5 font-semibold tabular-nums leading-none",
                    activeTab === tab.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}>
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.key && (
                  <motion.div
                    layoutId="member-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Payment History */}
      {activeTab === "payments" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No payments recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Method</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2">
                        {new Date(p.payment_date).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-4 py-2 font-medium">
                        {formatPaise(p.amount_in_paise ?? 0)}
                      </td>
                      <td className="px-4 py-2 capitalize">{p.payment_method?.replace("_", " ")}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            p.payment_status === "completed"
                              ? "success"
                              : p.payment_status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                          className="capitalize"
                        >
                          {p.payment_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground max-w-[200px] truncate">
                        {p.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Attendance History */}
      {activeTab === "attendance" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!attendanceData?.attendance || attendanceData.attendance.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No attendance records found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Check In</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Check Out</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {attendanceData.attendance.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2">
                        {new Date(a.check_in_at).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-4 py-2">
                        {new Date(a.check_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2">
                        {a.check_out_at
                          ? new Date(a.check_out_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                      <td className="px-4 py-2 capitalize">{a.source || "manual"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Invoices */}
      {activeTab === "invoices" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No invoices generated yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Invoice #</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Plan</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-medium">{inv.invoice_number}</td>
                      <td className="px-4 py-2">
                        {new Date(inv.invoice_date).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-4 py-2">{formatPaise(inv.amount_in_paise)}</td>
                      <td className="px-4 py-2">{inv.plan_name || "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a
                              href={invoiceService.getDownloadUrl(inv.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Download className="h-3.5 w-3.5 mr-1" />
                              PDF
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <Link href={`/invoices/${inv.id}`}>
                              View
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Timeline */}
      {activeTab === "timeline" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!timelineData?.events || timelineData.events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No activity recorded yet.
            </p>
          ) : (
            <div className="relative space-y-0">
              {timelineData.events.map((event, idx) => (
                <div key={event.id} className="flex gap-3 pb-4">
                  <div className="flex flex-col items-center">
                    <div className={`h-3 w-3 rounded-full flex-shrink-0 mt-1.5 ${
                      event.event_type === "payment" ? "bg-green-500" :
                      event.event_type === "attendance" ? "bg-blue-500" :
                      event.event_type === "status_change" ? "bg-orange-500" :
                      "bg-gray-400"
                    }`} />
                    {idx < timelineData.events.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-2">
                    <p className="text-sm font-medium">{event.title}</p>
                    {event.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(event.timestamp).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <Badge variant="secondary" className="capitalize text-xs h-fit">
                    {event.event_type.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Membership Override (Admin Only) */}
      <RoleGate allowed={["owner", "admin"]}>
        <MembershipOverrideForm member={member} />
      </RoleGate>
    </motion.div>
  );
}
