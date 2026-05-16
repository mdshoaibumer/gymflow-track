import { useQuery } from "@tanstack/react-query";
import { invoiceService } from "@/services/invoice.service";

export function useMemberInvoices(memberId: string | undefined) {
  return useQuery({
    queryKey: ["invoices", "member", memberId],
    queryFn: () => invoiceService.listMemberInvoices(memberId!),
    enabled: !!memberId,
  });
}

export function useInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["invoices", invoiceId],
    queryFn: () => invoiceService.getInvoice(invoiceId!),
    enabled: !!invoiceId,
  });
}

export function useInvoiceByPayment(paymentId: string | undefined) {
  return useQuery({
    queryKey: ["invoices", "payment", paymentId],
    queryFn: () => invoiceService.getInvoiceByPayment(paymentId!),
    enabled: !!paymentId,
  });
}

export function useInvoices(skip = 0, limit = 50) {
  return useQuery({
    queryKey: ["invoices", skip, limit],
    queryFn: () => invoiceService.listInvoices(skip, limit),
  });
}
