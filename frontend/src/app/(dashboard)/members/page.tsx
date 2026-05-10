"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { motion } from "framer-motion";
import { Search, Pencil, Trash2, Plus, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMembers, useCreateMember, useUpdateMember, useDeleteMember } from "@/hooks/use-members";
import type { Member, CreateMemberPayload } from "@/services/member.service";
import { RoleGate } from "@/components/role-gate";
import { MemberForm, memberToFormValues } from "@/components/members/member-form";
import { DeleteConfirmDialog } from "@/components/members/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { formatPaise } from "@/lib/utils";
import type { MemberFormValues } from "@/lib/validations/member";

const PAGE_SIZE = 20;

export default function MembersPage() {
  const { isAdminOrAbove } = useAuth();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Form states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);

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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingMember(row.original)}
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

  const totalPages = Math.ceil(total / PAGE_SIZE);

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
          </p>
        </div>
        <RoleGate allowed={["owner", "admin"]}>
          <Button
            onClick={() => {
              setShowCreateForm(true);
              setEditingMember(null);
            }}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Add Member
          </Button>
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
        <MemberForm
          key={editingMember.id}
          title={`Edit: ${editingMember.name}`}
          submitLabel="Save Changes"
          defaultValues={memberToFormValues(editingMember)}
          onSubmit={handleEdit}
          onCancel={() => setEditingMember(null)}
          isPending={updateMutation.isPending}
        />
      )}

      {/* Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="space-y-0">
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
          </CardContent>
        </Card>
      ) : members.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <UserPlus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">
              {debouncedSearch ? "No results found" : "No members yet"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm text-center">
              {debouncedSearch
                ? `No members matching "${debouncedSearch}"`
                : "Add your first member to get started with GymFlow."}
            </p>
            {!debouncedSearch && (
              <RoleGate allowed={["owner", "admin"]}>
                <Button className="mt-4" onClick={() => setShowCreateForm(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Member
                </Button>
              </RoleGate>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th
                            key={header.id}
                            className="px-4 py-3 text-left font-medium text-muted-foreground"
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
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
  if (values.amount_paid) payload.amount_paid = Math.round(values.amount_paid * 100);
  return payload;
}
