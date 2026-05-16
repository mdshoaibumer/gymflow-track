"use client";

import { MemberInvoice } from "@/services/invoice.service";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";

interface InvoiceViewProps {
  invoice: MemberInvoice;
  onDownloadPdf: () => void;
}

function formatAmount(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function InvoiceView({ invoice, onDownloadPdf }: InvoiceViewProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Action buttons - hidden during print */}
      <div className="flex gap-2 justify-end mb-4 print:hidden">
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
        <Button size="sm" onClick={onDownloadPdf}>
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
      </div>

      {/* Invoice content */}
      <div className="bg-white border rounded-lg p-8 print:border-none print:shadow-none print:p-0">
        {/* Header */}
        <div className="text-center border-b pb-4 mb-6">
          {invoice.gym_logo_url && (
            <img
              src={invoice.gym_logo_url}
              alt={invoice.gym_name}
              className="h-16 mx-auto mb-2 object-contain"
            />
          )}
          <h1 className="text-2xl font-bold">{invoice.gym_name}</h1>
          {invoice.gym_address && (
            <p className="text-muted-foreground text-sm">{invoice.gym_address}</p>
          )}
          {invoice.gym_phone && (
            <p className="text-muted-foreground text-sm">Phone: {invoice.gym_phone}</p>
          )}
        </div>

        {/* Invoice title and meta */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-semibold text-primary">INVOICE</h2>
            <p className="text-sm text-muted-foreground mt-1">
              #{invoice.invoice_number}
            </p>
          </div>
          <div className="text-right text-sm">
            <p>
              <span className="text-muted-foreground">Invoice Date: </span>
              {formatDate(invoice.invoice_date)}
            </p>
            <p>
              <span className="text-muted-foreground">Payment Date: </span>
              {formatDate(invoice.payment_date)}
            </p>
          </div>
        </div>

        {/* Bill To */}
        <div className="mb-6">
          <p className="text-sm font-semibold text-muted-foreground mb-1">BILL TO</p>
          <p className="font-medium">{invoice.member_name}</p>
          <p className="text-sm text-muted-foreground">Phone: {invoice.member_phone}</p>
        </div>

        {/* Line Items */}
        <table className="w-full mb-6">
          <thead>
            <tr className="bg-gray-900 text-white">
              <th className="text-left py-2 px-3 text-sm font-medium">Description</th>
              <th className="text-right py-2 px-3 text-sm font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-3 px-3">
                {invoice.plan_name || "Membership Payment"}
              </td>
              <td className="py-3 px-3 text-right font-medium">
                {formatAmount(invoice.amount_in_paise)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black">
              <td className="py-3 px-3 font-bold">Total</td>
              <td className="py-3 px-3 text-right font-bold text-lg">
                {formatAmount(invoice.amount_in_paise)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Payment details */}
        <div className="text-sm space-y-1 mb-6">
          <p>
            <span className="font-medium">Payment Mode: </span>
            <span className="capitalize">
              {invoice.payment_method.replace("_", " ")}
            </span>
          </p>
          {invoice.notes && (
            <p>
              <span className="font-medium">Notes: </span>
              {invoice.notes}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="text-center border-t pt-4 text-sm text-muted-foreground">
          Thank you for your payment!
        </div>
      </div>
    </div>
  );
}
