import { apiClient } from "@/lib/api-client";

export interface MemberInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  gym_name: string;
  gym_address: string | null;
  gym_phone: string | null;
  gym_logo_url: string | null;
  member_name: string;
  member_phone: string;
  amount_in_paise: number;
  payment_method: string;
  payment_date: string;
  plan_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface InvoiceListResponse {
  invoices: MemberInvoice[];
  total: number;
}

export const invoiceService = {
  async getInvoice(invoiceId: string): Promise<MemberInvoice> {
    const res = await apiClient.get(`/invoices/${invoiceId}`);
    return res.data;
  },

  async getInvoiceByPayment(paymentId: string): Promise<MemberInvoice> {
    const res = await apiClient.get(`/payments/${paymentId}/invoice`);
    return res.data;
  },

  async listMemberInvoices(
    memberId: string,
    skip = 0,
    limit = 50
  ): Promise<InvoiceListResponse> {
    const res = await apiClient.get(
      `/members/${memberId}/invoices?skip=${skip}&limit=${limit}`
    );
    return res.data;
  },

  async listInvoices(skip = 0, limit = 50): Promise<InvoiceListResponse> {
    const res = await apiClient.get(`/invoices?skip=${skip}&limit=${limit}`);
    return res.data;
  },

  getDownloadUrl(invoiceId: string): string {
    return `/api/v1/invoices/${invoiceId}/pdf`;
  },
};
