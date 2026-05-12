"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, User, CreditCard, CalendarCheck } from "lucide-react";
import { useMember } from "@/hooks/use-members";
import { formatPaise } from "@/lib/utils";
import { useMemberPayments } from "@/hooks/use-payments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhatsAppReminderButton } from "@/components/whatsapp/whatsapp-reminder-button";

const statusVariant: Record<string, "success" | "destructive" | "warning" | "secondary" | "outline"> = {
  active: "success",
  expired: "destructive",
  frozen: "warning",
  pending: "secondary",
  cancelled: "outline",
};

export default function MemberDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const { data: member, isLoading } = useMember(id);
  const { data: paymentData } = useMemberPayments(id);

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
              <span className="text-muted-foreground">Amount Paid: </span>
              {formatPaise(member.amount_paid)}
            </div>
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

      {/* Payment History */}
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
    </motion.div>
  );
}
