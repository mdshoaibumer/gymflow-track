"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Loader2, Shield } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { memberService, type Member, type MembershipOverridePayload } from "@/services/member.service";
import { toast } from "sonner";

interface MembershipOverrideFormProps {
  member: Member;
  onSuccess?: (updated: Member) => void;
  onCancel?: () => void;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "frozen", label: "Frozen" },
  { value: "pending", label: "Pending" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export function MembershipOverrideForm({ member, onSuccess, onCancel }: MembershipOverrideFormProps) {
  const queryClient = useQueryClient();

  const [plan, setPlan] = useState(member.membership_plan || "");
  const [startDate, setStartDate] = useState(member.membership_start || "");
  const [endDate, setEndDate] = useState(member.membership_end || "");
  const [status, setStatus] = useState(member.membership_status);

  const overrideMutation = useMutation({
    mutationFn: (payload: MembershipOverridePayload) =>
      memberService.overrideMembership(member.id, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Membership details updated successfully.");
      onSuccess?.(updated);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to override membership");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: MembershipOverridePayload = {
      version: member.version,
    };

    if (plan !== (member.membership_plan || "")) payload.membership_plan = plan || undefined;
    if (startDate !== (member.membership_start || "")) payload.membership_start = startDate || undefined;
    if (endDate !== (member.membership_end || "")) payload.membership_end = endDate || undefined;
    if (status !== member.membership_status) payload.membership_status = status;

    // Only submit if something actually changed
    const { version: _, ...fields } = payload;
    if (Object.keys(fields).length === 0) {
      toast.info("No changes detected");
      return;
    }

    overrideMutation.mutate(payload);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="border-amber-200 dark:border-amber-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-amber-600" />
            Membership Override (Admin Only)
          </CardTitle>
          {/* Warning Banner */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Manual membership overrides affect billing and reporting.
                Changes are logged for audit purposes.
              </span>
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Membership Plan */}
            <div className="space-y-1.5">
              <Label htmlFor="override-plan" className="text-sm">
                Membership Plan
              </Label>
              <Input
                id="override-plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder="e.g., Monthly, Quarterly, Annual"
                disabled={overrideMutation.isPending}
              />
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="override-start" className="text-sm">
                  Start Date
                </Label>
                <Input
                  id="override-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={overrideMutation.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="override-end" className="text-sm">
                  End Date
                </Label>
                <Input
                  id="override-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={overrideMutation.isPending}
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label htmlFor="override-status" className="text-sm">
                Membership Status
              </Label>
              <Select
                value={status}
                onValueChange={(val) => setStatus(val as typeof status)}
                disabled={overrideMutation.isPending}
              >
                <SelectTrigger id="override-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={overrideMutation.isPending}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={overrideMutation.isPending}
                className="min-w-[120px]"
              >
                {overrideMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Override"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
