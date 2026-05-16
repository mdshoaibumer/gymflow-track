"use client";

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useInvoice } from "@/hooks/use-invoices";
import { InvoiceView } from "@/components/invoices/invoice-view";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { data: invoice, isLoading } = useInvoice(id);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Invoice not found</p>
      </div>
    );
  }

  const handleDownloadPdf = () => {
    window.open(`/api/v1/invoices/${invoice.id}/pdf`, "_blank");
  };

  return (
    <div className="py-6">
      <InvoiceView invoice={invoice} onDownloadPdf={handleDownloadPdf} />
    </div>
  );
}
