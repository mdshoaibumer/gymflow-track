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
import { useVoidPayment } from "@/hooks/use-payments";
import type { Payment } from "@/services/payment.service";
import { formatPaise } from "@/lib/utils";

interface VoidPaymentModalProps {
  payment: Payment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoidPaymentModal({ payment, open, onOpenChange }: VoidPaymentModalProps) {
  const [reason, setReason] = useState("");
  const voidMutation = useVoidPayment();

  const handleVoid = async () => {
    if (!payment || reason.trim().length < 5) return;

    await voidMutation.mutateAsync({
      paymentId: payment.id,
      payload: { reason: reason.trim() },
    });
    setReason("");
    onOpenChange(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!voidMutation.isPending) {
      setReason("");
      onOpenChange(isOpen);
    }
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">Void Payment</DialogTitle>
          <DialogDescription className="text-center">
            Are you sure you want to void this payment? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Payment Summary */}
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Member</span>
              <span className="font-medium">{payment.member_name || "Unknown"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-semibold">{formatPaise(payment.amount_in_paise)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Date</span>
              <span>{new Date(payment.payment_date).toLocaleDateString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Method</span>
              <span className="capitalize">{payment.payment_method.replace("_", " ")}</span>
            </div>
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <Label htmlFor="void-reason" className="text-sm font-medium">
              Reason for voiding <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="void-reason"
              placeholder="e.g., Member requested refund due to relocation, incorrect amount collected..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[80px] resize-none"
              maxLength={500}
              disabled={voidMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              {reason.length}/500 characters (minimum 5 required)
            </p>
          </div>

          {/* Warning */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Important:</strong> Voiding this payment will mark it as refunded and
              automatically recalculate the member&apos;s financial totals from the payment ledger.
              The payment record will be preserved for audit purposes.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={voidMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleVoid}
            disabled={reason.trim().length < 5 || voidMutation.isPending}
          >
            {voidMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Void Payment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
