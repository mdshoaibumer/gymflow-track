"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { motion } from "framer-motion";
import { Plus, Receipt, Download, AlertCircle, RefreshCw, MoreHorizontal, Ban } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePayments, useCreatePayment } from "@/hooks/use-payments";
import type { Payment, CreatePaymentPayload } from "@/services/payment.service";
import { RoleGate } from "@/components/role-gate";
import { PaymentForm } from "@/components/payments/payment-form";
import { VoidPaymentModal } from "@/components/payments/void-payment-modal";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPaise } from "@/lib/utils";
import { downloadCsv } from "@/lib/export-csv";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type { PaymentFormValues } from "@/lib/validations/payment";

const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const { isAdminOrAbove } = useAuth();
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);

  const { data: paymentsData, isLoading, isError, refetch, isFetching } = usePayments({
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  });

  const payments = paymentsData?.payments ?? [];
  const total = paymentsData?.total ?? 0;

  const createMutation = useCreatePayment();

  const handleCreate = async (values: PaymentFormValues) => {
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
    await createMutation.mutateAsync(payload);
    setShowForm(false);
  };

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
            {row.original.member_name || "—"}
          </span>
        ),
      },
      {
        accessorKey: "amount_in_paise",
        header: "Amount",
        cell: ({ row }) => (
          <span className="font-semibold">
            {formatPaise(row.original.amount_in_paise)}
          </span>
        ),
      },
      {
        accessorKey: "payment_method",
        header: "Method",
        cell: ({ row }) => (
          <Badge variant="secondary" className="capitalize">
            {row.original.payment_method.replace("_", " ")}
          </Badge>
        ),
      },
      {
        accessorKey: "payment_status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.payment_status} />,
      },
      ...(isAdminOrAbove
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }: { row: { original: Payment } }) => {
                const payment = row.original;
                if (payment.payment_status !== "completed") return null;
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setVoidTarget(payment)}
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Void Payment
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              },
            } as ColumnDef<Payment>,
          ]
        : []),
    ],
    [isAdminOrAbove]
  );

  const table = useReactTable({
    data: payments,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(total / PAGE_SIZE),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground text-sm">
            {total} payment{total !== 1 ? "s" : ""} recorded
          </p>
        </div>
        <RoleGate allowed={["owner", "admin"]}>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  "/payments/csv",
                  `payments_${new Date().toISOString().split("T")[0]}.csv`,
                ).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Export failed. Please try again.");
                })
              }
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Record Payment
            </Button>
          </div>
        </RoleGate>
      </div>

      {/* Date Filters & Summary */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="w-full sm:w-40"
              aria-label="Filter payments from date"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="w-full sm:w-40"
              aria-label="Filter payments to date"
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDateFrom(""); setDateTo(""); setPage(0); }}
            >
              Clear
            </Button>
          )}
          {isFetching && !isLoading && (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </div>
        {payments.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Page Total</p>
            <p className="text-lg font-bold">
              {formatPaise(payments.reduce((sum, p) => sum + p.amount_in_paise, 0))}
            </p>
          </div>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <PaymentForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Void Modal */}
      <VoidPaymentModal
        payment={voidTarget}
        open={!!voidTarget}
        onOpenChange={(open) => { if (!open) setVoidTarget(null); }}
      />

      {/* Table */}
      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-destructive/10 p-3 mb-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold">Failed to load payments</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Something went wrong. Please try again.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="p-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-0">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-18 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={dateFrom || dateTo ? "No payments found" : "No payments yet"}
          description={
            dateFrom || dateTo
              ? "Try adjusting the date range filters."
              : "Record your first payment to start tracking revenue."
          }
          action={
            !(dateFrom || dateTo) && isAdminOrAbove
              ? { label: "Record First Payment", onClick: () => setShowForm(true), icon: Plus }
              : undefined
          }
        />
      ) : (
        <>
          {/* Desktop Table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table">
                  <caption className="sr-only">Payment records</caption>
                  <thead className="border-b bg-muted/50">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th
                            key={header.id}
                            scope="col"
                            className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y">
                    {table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        className={`hover:bg-muted/30 transition-colors ${
                          row.original.payment_status === "refunded" ? "opacity-60" : ""
                        }`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {payments.map((payment) => (
              <Card
                key={payment.id}
                className={`transition-shadow hover:shadow-md ${
                  payment.payment_status === "refunded" ? "opacity-60" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{payment.member_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(payment.payment_date).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <span className="text-lg font-bold">{formatPaise(payment.amount_in_paise)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize text-xs">
                        {payment.payment_method.replace("_", " ")}
                      </Badge>
                      <StatusBadge status={payment.payment_status} />
                    </div>
                    {isAdminOrAbove && payment.payment_status === "completed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive h-7 px-2 text-xs"
                        onClick={() => setVoidTarget(payment)}
                      >
                        <Ban className="mr-1 h-3 w-3" />
                        Void
                      </Button>
                    )}
                  </div>
                  {payment.payment_status === "refunded" && payment.void_reason && (
                    <p className="mt-2 text-xs text-muted-foreground italic">
                      Voided: {payment.void_reason}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}
    </motion.div>
  );
}
