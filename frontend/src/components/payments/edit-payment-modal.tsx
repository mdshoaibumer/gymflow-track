"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Payment, UpdatePaymentPayload } from "@/services/payment.service";
import { useUpdatePayment } from "@/hooks/use-payments";

interface EditPaymentModalProps {
  payment: Payment;
  onClose: () => void;
}

const METHODS = ["cash", "upi", "card", "bank_transfer", "other"] as const;
const STATUSES = ["completed", "pending", "failed"] as const;

export function EditPaymentModal({ payment, onClose }: EditPaymentModalProps) {
  const isPending = payment.payment_status === "pending";

  const [amount, setAmount] = useState(String(payment.amount_in_paise / 100));
  const [method, setMethod] = useState(payment.payment_method);
  const [status, setStatus] = useState(payment.payment_status);
  const [paymentDate, setPaymentDate] = useState(payment.payment_date);
  const [notes, setNotes] = useState(payment.notes || "");

  const updateMutation = useUpdatePayment();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: UpdatePaymentPayload = {};

    // For pending payments, include all changed fields
    if (isPending) {
      const newAmount = Math.round(Number(amount) * 100);
      if (newAmount !== payment.amount_in_paise) payload.amount_in_paise = newAmount;
      if (method !== payment.payment_method) payload.payment_method = method;
      if (status !== payment.payment_status) payload.payment_status = status;
      if (paymentDate !== payment.payment_date) payload.payment_date = paymentDate;
    } else {
      // For completed payments, only notes and method
      if (method !== payment.payment_method) payload.payment_method = method;
    }

    if (notes !== (payment.notes || "")) payload.notes = notes || undefined;

    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    updateMutation.mutate(
      { paymentId: payment.id, payload },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">
        Edit Payment {isPending ? "(Pending)" : "(Completed)"}
      </h2>
      {!isPending && (
        <p className="text-xs text-muted-foreground mb-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2">
          Completed payments: only notes and payment method can be edited.
          Use &ldquo;Void&rdquo; to reverse the payment.
        </p>
      )}
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        {/* Amount */}
        <div className="space-y-1.5">
          <Label htmlFor="edit-amount">Amount (₹)</Label>
          <Input
            id="edit-amount"
            type="number"
            step="0.01"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!isPending || updateMutation.isPending}
          />
        </div>

        {/* Payment Method */}
        <div className="space-y-1.5">
          <Label htmlFor="edit-method">Payment Method</Label>
          <select
            id="edit-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
            disabled={updateMutation.isPending}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        {/* Status (only for pending) */}
        {isPending && (
          <div className="space-y-1.5">
            <Label htmlFor="edit-status">Status</Label>
            <select
              id="edit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              disabled={updateMutation.isPending}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Payment Date (only for pending) */}
        {isPending && (
          <div className="space-y-1.5">
            <Label htmlFor="edit-date">Payment Date</Label>
            <Input
              id="edit-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-notes">Notes</Label>
          <Input
            id="edit-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            disabled={updateMutation.isPending}
          />
        </div>

        {/* Actions */}
        <div className="sm:col-span-2 flex gap-3 pt-2">
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
