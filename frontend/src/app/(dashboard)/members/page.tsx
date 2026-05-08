"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { Search, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  memberService,
  type Member,
  type CreateMemberPayload,
} from "@/services/member.service";
import { RoleGate } from "@/components/role-gate";
import { MemberForm, memberToFormValues } from "@/components/members/member-form";
import { DeleteConfirmDialog } from "@/components/members/delete-confirm-dialog";
import type { MemberFormValues } from "@/lib/validations/member";

const PAGE_SIZE = 20;

export default function MembersPage() {
  const { token, isAdminOrAbove } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchMembers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await memberService.list(token, {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
      });
      setMembers(data.members);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [token, page, debouncedSearch]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // --- Create ---
  const handleCreate = async (values: MemberFormValues) => {
    if (!token) return;
    const payload = formValuesToPayload(values);
    await memberService.create(token, payload);
    setShowCreateForm(false);
    fetchMembers();
  };

  // --- Edit ---
  const handleEdit = async (values: MemberFormValues) => {
    if (!token || !editingMember) return;
    const payload = formValuesToPayload(values);
    await memberService.replace(token, editingMember.id, payload);
    setEditingMember(null);
    fetchMembers();
  };

  // --- Delete ---
  const handleDelete = async () => {
    if (!token || !deletingMember) return;
    setIsDeleting(true);
    try {
      await memberService.delete(token, deletingMember.id);
      setDeletingMember(null);
      fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete member");
    } finally {
      setIsDeleting(false);
    }
  };

  // --- Table columns ---
  const columns = useMemo<ColumnDef<Member>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
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
        cell: ({ row }) => (
          <StatusBadge status={row.original.membership_status} />
        ),
      },
      {
        accessorKey: "amount_paid",
        header: "Paid",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            ₹{(row.original.amount_paid / 100).toLocaleString("en-IN")}
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
                  <button
                    onClick={() => setEditingMember(row.original)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeletingMember(row.original)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Members</h1>
          <p className="text-muted-foreground text-sm">
            {total} member{total !== 1 ? "s" : ""} in your gym
          </p>
        </div>
        <RoleGate allowed={["owner", "admin"]}>
          <button
            onClick={() => {
              setShowCreateForm(true);
              setEditingMember(null);
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            + Add Member
          </button>
        </RoleGate>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full rounded-md border border-input pl-9 pr-3 py-2 text-sm"
        />
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <MemberForm
          title="Add New Member"
          submitLabel="Add Member"
          onSubmit={handleCreate}
          onCancel={() => setShowCreateForm(false)}
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
      ) : members.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          {debouncedSearch
            ? `No members matching "${debouncedSearch}"`
            : "No members yet. Add your first member to get started."}
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

      {/* Delete Dialog */}
      {deletingMember && (
        <DeleteConfirmDialog
          memberName={deletingMember.name}
          isDeleting={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeletingMember(null)}
        />
      )}
    </div>
  );
}

// --- Helpers ---

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    expired: "bg-red-100 text-red-800",
    frozen: "bg-yellow-100 text-yellow-800",
    pending: "bg-blue-100 text-blue-800",
    cancelled: "bg-gray-100 text-gray-600",
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
