"use client";

import { useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { motion } from "framer-motion";
import {
  IndianRupee,
  Users,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  MoreHorizontal,
  HandCoins,
  XCircle,
  MessageCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDues, useDuesSummary } from "@/hooks/use-dues";
import type { DueResponse, DueStatus } from "@/services/dues.service";
import { RoleGate } from "@/components/role-gate";
import { PayDueModal } from "@/components/collections/pay-due-modal";
import { WaiveDueModal } from "@/components/collections/waive-due-modal";
import { AgingReport } from "@/components/collections/aging-report";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { ColumnFilters, type FilterDefinition } from "@/components/column-filters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPaise } from "@/lib/utils";

const PAGE_SIZE = 20;

function DueStatusBadge({ status }: { status: DueStatus }) {
  const variants: Record<DueStatus, { className: string; label: string }> = {
    pending: { className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", label: "Pending" },
    partial: { className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", label: "Partial" },
    paid: { className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "Paid" },
    waived: { className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", label: "Waived" },
  };
  const v = variants[status];
  return <Badge className={v.className}>{v.label}</Badge>;
}

function daysOverdue(dueDateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(dueDateStr);
  dueDate.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function OverdueBadge({ dueDateStr }: { dueDateStr: string }) {
  const days = daysOverdue(dueDateStr);
  if (days === 0) return <span className="text-xs text-muted-foreground">Due today</span>;
  const color = days > 90
    ? "text-red-600 dark:text-red-400"
    : days > 60
    ? "text-orange-600 dark:text-orange-400"
    : days > 30
    ? "text-amber-600 dark:text-amber-400"
    : "text-muted-foreground";
  return <span className={`text-xs font-medium ${color}`}>{days}d overdue</span>;
}

export default function CollectionsPage() {
  const { isOwner, isAdminOrAbove } = useAuth();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [payTarget, setPayTarget] = useState<DueResponse | null>(null);
  const [waiveTarget, setWaiveTarget] = useState<DueResponse | null>(null);

  const filterDefinitions = useMemo<FilterDefinition[]>(() => [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "pending", label: "Pending" },
        { value: "partial", label: "Partial" },
        { value: "paid", label: "Paid" },
        { value: "waived", label: "Waived" },
      ],
    },
  ], []);

  const filterValues = useMemo(() => ({
    status: statusFilter,
  }), [statusFilter]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    if (key === "status") setStatusFilter(value);
    setPage(0);
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setStatusFilter("");
    setPage(0);
  }, []);

  const { data: duesData, isLoading, isError, refetch, isFetching } = useDues({
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    status: (statusFilter as DueStatus) || undefined,
  });

  const { data: summary } = useDuesSummary();

  const dues = duesData?.items ?? [];
  const total = duesData?.total ?? 0;

  const columns = useMemo<ColumnDef<DueResponse>[]>(
    () => [
      {
        accessorKey: "member",
        header: "Member",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-sm">{row.original.member?.name || "—"}</p>
            <p className="text-xs text-muted-foreground">{row.original.member?.phone || ""}</p>
          </div>
        ),
      },
      {
        accessorKey: "plan_name",
        header: "Plan",
        cell: ({ row }) => (
          <span className="text-sm">{row.original.plan_name}</span>
        ),
      },
      {
        accessorKey: "balance_paise",
        header: "Outstanding",
        cell: ({ row }) => (
          <span className="font-semibold text-destructive">
            {formatPaise(row.original.balance_paise)}
          </span>
        ),
      },
      {
        accessorKey: "due_date",
        header: "Age",
        cell: ({ row }) => <OverdueBadge dueDateStr={row.original.due_date} />,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <DueStatusBadge status={row.original.status} />,
      },
      ...(isAdminOrAbove
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }: { row: { original: DueResponse } }) => {
                const due = row.original;
                if (due.status === "paid" || due.status === "waived") return null;
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setPayTarget(due)}>
                        <HandCoins className="mr-2 h-4 w-4" />
                        Record Payment
                      </DropdownMenuItem>
                      {due.member?.phone && (
                        <DropdownMenuItem
                          onClick={() => {
                            const msg = encodeURIComponent(
                              `Hi ${due.member?.name}, your payment of ${formatPaise(due.balance_paise)} for ${due.plan_name} membership is pending. Please visit the gym to complete the payment. Thank you!`
                            );
                            window.open(`https://wa.me/91${due.member?.phone}?text=${msg}`, "_blank");
                          }}
                        >
                          <MessageCircle className="mr-2 h-4 w-4" />
                          WhatsApp Reminder
                        </DropdownMenuItem>
                      )}
                      {isOwner && (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setWaiveTarget(due)}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Waive Due
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              },
            } as ColumnDef<DueResponse>,
          ]
        : []),
    ],
    [isAdminOrAbove, isOwner]
  );

  const table = useReactTable({
    data: dues,
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
          <h1 className="text-2xl font-bold tracking-tight text-gradient-subtle">Collections</h1>
          <p className="text-muted-foreground text-sm">
            Track and collect outstanding dues from members
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/20">
              <IndianRupee className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total Outstanding</p>
              {summary ? (
                <p className="text-lg font-bold truncate">{formatPaise(summary.total_outstanding_paise)}</p>
              ) : (
                <Skeleton className="h-6 w-20" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/20">
              <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Members with Dues</p>
              {summary ? (
                <p className="text-lg font-bold">{summary.total_members_with_dues}</p>
              ) : (
                <Skeleton className="h-6 w-12" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/20">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Collected This Month</p>
              {summary ? (
                <p className="text-lg font-bold truncate">{formatPaise(summary.collected_this_month_paise)}</p>
              ) : (
                <Skeleton className="h-6 w-20" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aging Report */}
      <AgingReport />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <ColumnFilters
          definitions={filterDefinitions}
          values={filterValues}
          onChange={handleFilterChange}
          onClear={handleClearAllFilters}
        />
        {isFetching && !isLoading && (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        )}
        {dues.length > 0 && (
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground">Outstanding on Page</p>
            <p className="text-lg font-bold text-destructive">
              {formatPaise(dues.reduce((sum, d) => sum + d.balance_paise, 0))}
            </p>
          </div>
        )}
      </div>

      {/* Pay Due Modal */}
      <PayDueModal
        due={payTarget}
        open={!!payTarget}
        onOpenChange={(open) => { if (!open) setPayTarget(null); }}
      />

      {/* Waive Due Modal */}
      <WaiveDueModal
        due={waiveTarget}
        open={!!waiveTarget}
        onOpenChange={(open) => { if (!open) setWaiveTarget(null); }}
      />

      {/* Table / Cards */}
      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-destructive/10 p-3 mb-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold">Failed to load dues</h3>
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
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : dues.length === 0 ? (
        <EmptyState
          icon={IndianRupee}
          title={statusFilter ? "No dues found" : "No outstanding dues"}
          description={
            statusFilter
              ? "Try adjusting the filters."
              : "All members are up to date on their payments. Great work!"
          }
        />
      ) : (
        <>
          {/* Desktop Table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table">
                  <caption className="sr-only">Outstanding dues</caption>
                  <thead className="border-b bg-muted/30 dark:bg-muted/15">
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
                  <tbody className="divide-y divide-border/50">
                    {table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-primary/[0.02] dark:hover:bg-primary/[0.04] transition-colors duration-150"
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
            {dues.map((due) => (
              <Card
                key={due.id}
                className="hover:shadow-soft-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{due.member?.name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {due.plan_name} • <OverdueBadge dueDateStr={due.due_date} />
                      </p>
                    </div>
                    <span className="text-lg font-bold text-destructive ml-2 shrink-0">
                      {formatPaise(due.balance_paise)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <DueStatusBadge status={due.status} />
                    {isAdminOrAbove && (due.status === "pending" || due.status === "partial") && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setPayTarget(due)}
                        >
                          <HandCoins className="mr-1 h-3 w-3" />
                          Pay
                        </Button>
                        {due.member?.phone && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              const msg = encodeURIComponent(
                                `Hi ${due.member?.name}, your payment of ${formatPaise(due.balance_paise)} for ${due.plan_name} membership is pending. Please visit the gym to complete the payment. Thank you!`
                              );
                              window.open(`https://wa.me/91${due.member?.phone}?text=${msg}`, "_blank");
                            }}
                          >
                            <MessageCircle className="mr-1 h-3 w-3" />
                            Remind
                          </Button>
                        )}
                        <RoleGate allowed={["owner"]}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive h-7 px-2 text-xs"
                            onClick={() => setWaiveTarget(due)}
                          >
                            <XCircle className="mr-1 h-3 w-3" />
                            Waive
                          </Button>
                        </RoleGate>
                      </div>
                    )}
                  </div>
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
