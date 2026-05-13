"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { motion } from "framer-motion";
import { Search, Pencil, Trash2, Plus, UserPlus, Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMembers, useCreateMember, useUpdateMember, useDeleteMember, useMemberTabSync } from "@/hooks/use-members";
import type { Member, CreateMemberPayload } from "@/services/member.service";
import { RoleGate } from "@/components/role-gate";
import { MemberForm, memberToFormValues } from "@/components/members/member-form";
import { DeleteConfirmDialog } from "@/components/members/delete-confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { WhatsAppReminderButton } from "@/components/whatsapp/whatsapp-reminder-button";
import { formatPaise } from "@/lib/utils";
import { downloadCsv } from "@/lib/export-csv";
import { toast } from "sonner";
import { useUsageInfo } from "@/hooks/use-feature-access";
import { UpgradePrompt } from "@/components/subscription/upgrade-prompt";
import type { MemberFormValues } from "@/lib/validations/member";

const PAGE_SIZE = 20;

export default function MembersPage() {
  const { isAdminOrAbove } = useAuth();
  const usage = useUsageInfo();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Multi-tab sync: invalidates member queries when another browser tab
  // creates, updates, or deletes a member (via BroadcastChannel).
  useMemberTabSync();

  // Form states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const editFormRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to edit form when it opens
  useEffect(() => {
    if (editingMember && editFormRef.current) {
      editFormRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [editingMember]);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // TanStack Query
  const { data, isLoading } = useMembers({
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
  });

  const members = data?.members ?? [];
  const total = data?.total ?? 0;

  const createMutation = useCreateMember();
  const updateMutation = useUpdateMember();
  const deleteMutation = useDeleteMember();

  const handleCreate = async (values: MemberFormValues) => {
    if (createMutation.isPending) return;
    const payload = formValuesToPayload(values);
    await createMutation.mutateAsync(payload);
    setShowCreateForm(false);
  };

  const handleEdit = async (values: MemberFormValues) => {
    if (!editingMember || updateMutation.isPending) return;
    const payload = formValuesToPayload(values);
    // Include version for optimistic locking — server returns 409 if stale
    payload.version = editingMember.version;
    await updateMutation.mutateAsync({ id: editingMember.id, data: payload });
    setEditingMember(null);
  };

  const handleDelete = async () => {
    if (!deletingMember) return;
    await deleteMutation.mutateAsync(deletingMember.id);
    setDeletingMember(null);
  };

  const columns = useMemo<ColumnDef<Member>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link href={`/members/${row.original.id}`} className="font-medium text-primary hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.phone}</span>
        ),
      },
      {
        accessorKey: "membership_plan",
        header: "Plan",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.membership_plan || "—"}
          </span>
        ),
      },
      {
        accessorKey: "membership_status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.membership_status} />,
      },
      {
        accessorKey: "amount_paid",
        header: "Paid",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatPaise(row.original.amount_paid)}
          </span>
        ),
      },
      ...(isAdminOrAbove
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }: { row: { original: Member } }) => (
                <div className="flex justify-end gap-1">
                  <WhatsAppReminderButton
                    compact
                    member={{
                      name: row.original.name,
                      phone: row.original.phone,
                      membership_end: row.original.membership_end,
                      membership_plan: row.original.membership_plan,
                      amount_due: row.original.amount_paid,
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => { setShowCreateForm(false); setEditingMember(row.original); }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeletingMember(row.original)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ),
            } as ColumnDef<Member>,
          ]
        : []),
    ],
    [isAdminOrAbove]
  );

  const table = useReactTable({
    data: members,
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
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground text-sm">
            {total} member{total !== 1 ? "s" : ""} in your gym
            {!usage.isLoading && !usage.isUnlimitedMembers && (
              <span className="ml-1">
                ({usage.currentMembers} of {usage.maxMembers} active slots used)
              </span>
            )}
          </p>
        </div>
        <RoleGate allowed={["owner", "admin"]}>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  "/members/csv",
                  `members_${new Date().toISOString().split("T")[0]}.csv`,
                  debouncedSearch ? { search: debouncedSearch } : undefined,
                ).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Export failed. Please try again.");
                })
              }
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              onClick={() => {
                setShowCreateForm(true);
                setEditingMember(null);
              }}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Add Member
            </Button>
          </div>
        </RoleGate>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="pl-9"
          aria-label="Search members"
        />
      </div>

      {/* Usage warning */}
      {usage.memberWarningLevel !== "none" && (
        <UpgradePrompt
          level={usage.memberWarningLevel}
          resource="members"
          current={usage.currentMembers}
          max={usage.maxMembers}
          isUnlimited={usage.isUnlimitedMembers}
        />
      )}

      {/* Create Form */}
      {showCreateForm && (
        <MemberForm
          title="Add New Member"
          submitLabel="Add Member"
          onSubmit={handleCreate}
          onCancel={() => setShowCreateForm(false)}
          isPending={createMutation.isPending}
        />
      )}

      {/* Edit Form */}
      {editingMember && (
        <div ref={editFormRef}>
          <MemberForm
            key={editingMember.id}
            title={`Edit: ${editingMember.name}`}
            submitLabel="Save Changes"
            defaultValues={memberToFormValues(editingMember)}
            onSubmit={handleEdit}
            onCancel={() => setEditingMember(null)}
            isPending={updateMutation.isPending}
          />
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            {/* Desktop skeleton */}
            <div className="hidden md:block space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-0">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
            {/* Mobile skeleton */}
            <div className="space-y-3 p-4 md:hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : members.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={debouncedSearch ? "No results found" : "No members yet"}
          description={
            debouncedSearch
              ? `No members matching "${debouncedSearch}"`
              : "Add your first member to get started with GymFlow Track."
          }
          action={
            !debouncedSearch && isAdminOrAbove
              ? {
                  label: "Add First Member",
                  onClick: () => setShowCreateForm(true),
                  icon: Plus,
                }
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
                  <caption className="sr-only">Gym members list</caption>
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
                      <tr key={row.id} className="hover:bg-muted/30 transition-colors">
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
            {members.map((member) => (
              <Card key={member.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/members/${member.id}`}
                        className="font-medium text-primary hover:underline truncate block"
                      >
                        {member.name}
                      </Link>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {member.phone}
                      </p>
                    </div>
                    <StatusBadge status={member.membership_status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {member.membership_plan || "No plan"}
                    </span>
                    <span className="font-medium">{formatPaise(member.amount_paid)}</span>
                  </div>
                  {isAdminOrAbove && (
                    <div className="mt-3 flex justify-end gap-1 border-t pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => { setShowCreateForm(false); setEditingMember(member); }}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => setDeletingMember(member)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}

      {/* Delete Dialog */}
      {deletingMember && (
        <DeleteConfirmDialog
          memberName={deletingMember.name}
          isDeleting={deleteMutation.isPending}
          onConfirm={handleDelete}
          onCancel={() => setDeletingMember(null)}
        />
      )}
    </motion.div>
  );
}

function formValuesToPayload(values: MemberFormValues): CreateMemberPayload {
  const payload: CreateMemberPayload = {
    name: values.name,
    phone: values.phone,
  };
  if (values.email) payload.email = values.email;
  const gender = values.gender;
  if (gender === "male" || gender === "female" || gender === "other") {
    payload.gender = gender;
  }
  if (values.membership_plan) payload.membership_plan = values.membership_plan;
  if (values.membership_start) payload.membership_start = values.membership_start;
  if (values.membership_end) payload.membership_end = values.membership_end;
  if (values.amount_paid != null) payload.amount_paid = Math.round(values.amount_paid * 100);
  return payload;
}
