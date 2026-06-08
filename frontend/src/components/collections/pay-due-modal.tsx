"use client";

import { useState } from "react";
import { IndianRupee, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePayDue } from "@/hooks/use-dues";
import type { DueResponse } from "@/services/dues.service";
import type { PaymentMethod } from "@/services/payment.service";
import { formatPaise } from "@/lib/utils";

interface PayDueModalProps {
  due: DueResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PayDueModal({ due, open, onOpenChange }: PayDueModalProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const payMutation = usePayDue();

  const handleOpen = (isOpen: boolean) => {
    if (isOpen && due) {
      setAmount(String(due.balance_paise / 100));
      setMethod("cash");
      setNotes("");
    }
    if (!payMutation.isPending) {
      onOpenChange(isOpen);
    }
  };

  const handlePay = async () => {
    if (!due) return;
    const amountPaise = Math.round(Number(amount) * 100);
    if (amountPaise <= 0 || amountPaise > due.balance_paise) return;

    await payMutation.mutateAsync({
      dueId: due.id,
      payload: {
        amount_in_paise: amountPaise,
        payment_method: method,
        notes: notes.trim() || undefined,
      },
    });
    onOpenChange(false);
  };

  if (!due) return null;

  const amountPaise = Math.round(Number(amount) * 100);
  const isValid = amountPaise > 0 && amountPaise <= due.balance_paise;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <IndianRupee className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Record Payment</DialogTitle>
          <DialogDescription className="text-center">
            Pay against outstanding due for {due.member?.name || "member"}
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
              <span className="text-muted-foreground">Total Due</span>
              <span className="font-semibold">{formatPaise(due.effective_amount_paise)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Already Paid</span>
              <span>{formatPaise(due.total_paid_paise)}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-1 mt-1">
              <span className="text-muted-foreground font-medium">Outstanding</span>
              <span className="font-bold text-destructive">{formatPaise(due.balance_paise)}</span>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Amount (₹)</Label>
            <Input
              id="pay-amount"
              type="number"
              min="1"
              max={due.balance_paise / 100}
              step="1"
              placeholder={`Max: ₹${(due.balance_paise / 100).toLocaleString("en-IN")}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={payMutation.isPending}
            />
            {amount && !isValid && (
              <p className="text-xs text-destructive">
                Amount must be between ₹1 and {formatPaise(due.balance_paise)}
              </p>
            )}
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="pay-method">Payment Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)} disabled={payMutation.isPending}>
              <SelectTrigger id="pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="pay-notes">Notes (optional)</Label>
            <Textarea
              id="pay-notes"
              placeholder="e.g., Partial payment, will pay rest next week"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[60px] resize-none"
              maxLength={500}
              disabled={payMutation.isPending}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={payMutation.isPending}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePay}
            disabled={!isValid || payMutation.isPending}
            className="w-full sm:w-auto"
          >
            {payMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Pay {amount ? formatPaise(amountPaise) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
