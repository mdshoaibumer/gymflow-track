"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useWaiveDue } from "@/hooks/use-dues";
import type { DueResponse } from "@/services/dues.service";
import { formatPaise } from "@/lib/utils";

interface WaiveDueModalProps {
  due: DueResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WaiveDueModal({ due, open, onOpenChange }: WaiveDueModalProps) {
  const [reason, setReason] = useState("");
  const waiveMutation = useWaiveDue();

  const handleWaive = async () => {
    if (!due || reason.trim().length < 5) return;

    await waiveMutation.mutateAsync({
      dueId: due.id,
      payload: { reason: reason.trim() },
    });
    setReason("");
    onOpenChange(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!waiveMutation.isPending) {
      setReason("");
      onOpenChange(isOpen);
    }
  };

  if (!due) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <DialogTitle className="text-center">Waive Due</DialogTitle>
          <DialogDescription className="text-center">
            Write off this outstanding balance. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Due Summary */}
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Member</span>
              <span className="font-medium">{due.member?.name || "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Plan</span>
              <span>{due.plan_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Outstanding</span>
              <span className="font-bold text-destructive">{formatPaise(due.balance_paise)}</span>
            </div>
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <Label htmlFor="waive-reason" className="text-sm font-medium">
              Reason for waiving <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="waive-reason"
              placeholder="e.g., Member facing financial hardship, goodwill gesture for long-term member..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[80px] resize-none"
              maxLength={500}
              disabled={waiveMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              {reason.length}/500 characters (minimum 5 required)
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={waiveMutation.isPending}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleWaive}
            disabled={reason.trim().length < 5 || waiveMutation.isPending}
            className="w-full sm:w-auto"
          >
            {waiveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Waive {formatPaise(due.balance_paise)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
