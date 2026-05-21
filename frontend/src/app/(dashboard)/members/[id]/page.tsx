"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, User, CreditCard, CalendarCheck, FileText, Download, Snowflake, Play, RefreshCw, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMember, useMemberTimeline } from "@/hooks/use-members";
import { formatPaise } from "@/lib/utils";
import { useMemberPayments } from "@/hooks/use-payments";
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
import { RoleGate } from "@/components/role-gate";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const statusVariant: Record<string, "success" | "destructive" | "warning" | "secondary" | "outline"> = {
  active: "success",
  expired: "destructive",
  frozen: "warning",
  pending: "secondary",
  cancelled: "outline",
};

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdminOrAbove } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: member, isLoading } = useMember(id);
  const { data: paymentData } = useMemberPayments(id);
  const { data: invoiceData } = useMemberInvoices(id);
  const { data: attendanceData } = useMemberAttendance(id, 0, 50);
  const { data: timelineData } = useMemberTimeline(id);
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"payments" | "attendance" | "invoices" | "timeline">("payments");

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

  const payments = paymentData?.payments ?? [];
  const invoices = invoiceData?.invoices ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/members">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <MemberPhotoUpload memberId={member.id} photoUrl={member.photo_url} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{member.name}</h1>
          <p className="text-sm text-muted-foreground">{member.phone}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <WhatsAppReminderButton
            member={{
              name: member.name,
              phone: member.phone,
              membership_end: member.membership_end,
              membership_plan: member.membership_plan,
              amount_due: member.amount_paid,
            }}
          />
          <Badge variant={statusVariant[member.membership_status] ?? "secondary"} className="capitalize">
            {member.membership_status}
          </Badge>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Personal Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Email: </span>
              {member.email || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Gender: </span>
              {member.gender ? member.gender.charAt(0).toUpperCase() + member.gender.slice(1) : "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Date of Birth: </span>
              {member.date_of_birth ? new Date(member.date_of_birth).toLocaleDateString("en-IN") : "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Batch: </span>
              {member.batch ? member.batch.charAt(0).toUpperCase() + member.batch.slice(1) : "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Emergency Contact: </span>
              {member.emergency_contact || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Amount Paid: </span>
              {formatPaise(member.amount_paid)}
            </div>
            {member.custom_fields && Object.entries(member.custom_fields).map(([key, value]) => (
              <div key={key}>
                <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}: </span>
                {value ?? "—"}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Membership</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Plan: </span>
              {member.membership_plan || "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Start: </span>
              {member.membership_start
                ? new Date(member.membership_start).toLocaleDateString("en-IN")
                : "—"}
            </div>
            <div>
              <span className="text-muted-foreground">End: </span>
              {member.membership_end
                ? new Date(member.membership_end).toLocaleDateString("en-IN")
                : "—"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Payments Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Total payments: </span>
              {payments.length}
            </div>
            <div>
              <span className="text-muted-foreground">Total paid: </span>
              ₹
              {(
                payments.reduce((sum, p) => sum + (p.amount_in_paise ?? 0), 0) / 100
              ).toLocaleString("en-IN")}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button
          variant="default"
          onClick={() => router.push(`/payments?member_id=${member.id}`)}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Renew Membership
        </Button>
        <RoleGate allowed={["owner", "admin"]}>
          <Button
            variant={member.membership_status === "frozen" ? "default" : "outline"}
            disabled={freezeLoading}
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
              <>
                <Play className="mr-2 h-4 w-4" />
                Unfreeze
              </>
            ) : (
              <>
                <Snowflake className="mr-2 h-4 w-4" />
                Freeze
              </>
            )}
          </Button>
        </RoleGate>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "payments" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("payments")}
        >
          Payment History
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "attendance" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("attendance")}
        >
          Attendance History
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "invoices" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("invoices")}
        >
          Invoices
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "timeline" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("timeline")}
        >
          <Activity className="inline-block h-3.5 w-3.5 mr-1" />
          Timeline
        </button>
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
