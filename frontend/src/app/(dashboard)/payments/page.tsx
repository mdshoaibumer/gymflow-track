"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  paymentService,
  type Payment,
  type CreatePaymentPayload,
} from "@/services/payment.service";
import { memberService, type Member } from "@/services/member.service";
import { RoleGate } from "@/components/role-gate";
import { PaymentForm } from "@/components/payments/payment-form";
import type { PaymentFormValues } from "@/lib/validations/payment";

const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const { token, isAdminOrAbove } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  // Fetch members for the payment form dropdown
  useEffect(() => {
    if (!token) return;
    memberService
      .list(token, { skip: 0, limit: 500 })
      .then((data) => setMembers(data.members))
      .catch(() => {});
  }, [token]);

  const fetchPayments = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await paymentService.list(token, {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setPayments(data.payments);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [token, page]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleCreate = async (values: PaymentFormValues) => {
    if (!token) return;
    const payload: CreatePaymentPayload = {
      member_id: values.member_id,
      amount_in_paise: Math.round(values.amount * 100),
      payment_method: values.payment_method,
      payment_status: values.payment_status,
      payment_date: values.payment_date || undefined,
      notes: values.notes || undefined,
      membership_plan: values.membership_plan || undefined,
      membership_start: values.membership_start || undefined,
      membership_end: values.membership_end || undefined,
    };
    await paymentService.create(token, payload);
    setShowForm(false);
    fetchPayments();
  };

  // Map member_id to name for display
  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.id, m.name);
    }
    return map;
  }, [members]);

  const columns = useMemo<ColumnDef<Payment>[]>(
    () => [
      {
        accessorKey: "payment_date",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-sm">
            {new Date(row.original.payment_date).toLocaleDateString("en-IN")}
          </span>
        ),
      },
      {
        accessorKey: "member_id",
        header: "Member",
        cell: ({ row }) => (
          <span className="font-medium">
            {memberMap.get(row.original.member_id) || "—"}
          </span>
        ),
      },
      {
        accessorKey: "amount_in_paise",
        header: "Amount",
        cell: ({ row }) => (
          <span className="font-semibold">
            ₹{(row.original.amount_in_paise / 100).toLocaleString("en-IN")}
          </span>
        ),
      },
      {
        accessorKey: "payment_method",
        header: "Method",
        cell: ({ row }) => (
          <span className="rounded bg-muted px-2 py-0.5 text-xs capitalize">
            {row.original.payment_method.replace("_", " ")}
          </span>
        ),
      },
      {
        accessorKey: "payment_status",
        header: "Status",
        cell: ({ row }) => <PaymentStatusBadge status={row.original.payment_status} />,
      },
    ],
    [memberMap]
  );

  const table = useReactTable({
    data: payments,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(total / PAGE_SIZE),
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-muted-foreground text-sm">
            {total} payment{total !== 1 ? "s" : ""} recorded
          </p>
        </div>
        <RoleGate allowed={["owner", "admin"]}>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Record Payment
          </button>
        </RoleGate>
      </div>

      {/* Form */}
      {showForm && (
        <PaymentForm
          members={members}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : payments.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          No payments recorded yet. Record your first payment to get started.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left font-medium"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y">
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-accent"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-accent"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    failed: "bg-red-100 text-red-800",
    refunded: "bg-gray-100 text-gray-800",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        styles[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status}
    </span>
  );
}
