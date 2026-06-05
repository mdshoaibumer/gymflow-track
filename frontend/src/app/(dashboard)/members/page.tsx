"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Pencil, Trash2, Plus, UserPlus, Download, User, CheckSquare, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMembers, useCreateMember, useUpdateMember, useDeleteMember, useMemberTabSync } from "@/hooks/use-members";
import { memberService, type Member, type CreateMemberPayload } from "@/services/member.service";
import { RoleGate } from "@/components/role-gate";
import { MemberForm, memberToFormValues } from "@/components/members/member-form";
import { DeleteConfirmDialog } from "@/components/members/delete-confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { ColumnFilters, type FilterDefinition } from "@/components/column-filters";
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
import { useMembershipPlans } from "@/hooks/use-membership-plans";
import { useQueryClient } from "@tanstack/react-query";
import type { MemberFormValues } from "@/lib/validations/member";

const PAGE_SIZE = 20;

export default function MembersPage() {
  const { isAdminOrAbove } = useAuth();
  const usage = useUsageInfo();
  const searchParams = useSearchParams();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") || "");
  const [planFilter, setPlanFilter] = useState<string>(searchParams.get("plan") || "");
  const [batchFilter, setBatchFilter] = useState<string>("");

  const { data: plans = [] } = useMembershipPlans();

  const filterDefinitions = useMemo<FilterDefinition[]>(() => [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "expired", label: "Expired" },
        { value: "frozen", label: "Frozen" },
        { value: "pending", label: "Pending" },
        { value: "cancelled", label: "Cancelled" },
      ],
    },
    {
      key: "plan",
      label: "Plan",
      options: plans.map((p) => ({ value: p.name, label: p.name })),
    },
    {
      key: "batch",
      label: "Batch",
      options: [
        { value: "morning", label: "Morning" },
        { value: "afternoon", label: "Afternoon" },
        { value: "evening", label: "Evening" },
      ],
    },
  ], [plans]);

  const filterValues = useMemo(() => ({
    status: statusFilter,
    plan: planFilter,
    batch: batchFilter,
  }), [statusFilter, planFilter, batchFilter]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    if (key === "status") setStatusFilter(value);
    else if (key === "plan") setPlanFilter(value);
    else if (key === "batch") setBatchFilter(value);
    setPage(0);
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setStatusFilter("");
    setPlanFilter("");
    setBatchFilter("");
    setPage(0);
  }, []);

  // Multi-tab sync: invalidates member queries when another browser tab
  // creates, updates, or deletes a member (via BroadcastChannel).
  useMemberTabSync();

  // Form states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; name: string } | null>(null);
  const editFormRef = useRef<HTMLDivElement>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>("active");
  const [bulkLoading, setBulkLoading] = useState(false);
  const queryClient = useQueryClient();

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
    status: statusFilter || undefined,
    plan: planFilter || undefined,
    batch: batchFilter || undefined,
  });

  const members = useMemo(() => data?.members ?? [], [data?.members]);
  const total = data?.total ?? 0;

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === members.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(members.map((m) => m.id)));
    }
  }, [members, selectedIds.size]);

  const handleBulkStatusChange = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const result = await memberService.bulkChangeStatus(Array.from(selectedIds), bulkStatus);
      toast.success(`Updated ${result.updated_count} member(s) to "${bulkStatus}"`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["members"] });
    } catch {
      toast.error("Bulk status change failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const createMutation = useCreateMember();
  const updateMutation = useUpdateMember();
  const deleteMutation = useDeleteMember();

  const handleCreate = async (
    values: MemberFormValues & { 
      custom_fields?: Record<string, string | number | null>;
      photoFile?: File | null;
    }
  ) => {
    if (createMutation.isPending) return;
    const payload = formValuesToPayload(values);
    try {
      const newMember = await createMutation.mutateAsync(payload);
      if (newMember && values.photoFile) {
        try {
          await memberService.uploadPhoto(newMember.id, values.photoFile);
          toast.success("Member and photo registered successfully!");
        } catch (err) {
          console.error("Failed to upload member photo:", err);
          toast.error("Member registered successfully, but photo upload failed.");
        }
      } else {
        toast.success("Member registered successfully!");
      }
    } catch (err) {
      console.error("Registration failed:", err);
      throw err;
    }
    setShowCreateForm(false);
  };

  const handleEdit = async (
    values: MemberFormValues & { 
      custom_fields?: Record<string, string | number | null>;
      photoFile?: File | null;
    }
  ) => {
    if (!editingMember || updateMutation.isPending) return;
    const payload = formValuesToPayload(values);
    // Include version for optimistic locking — server returns 409 if stale
    payload.version = editingMember.version;

    // Check if membership fields changed — these go through the override API
    const membershipChanged =
      (values.membership_plan || "") !== (editingMember.membership_plan || "") ||
      (values.membership_start || "") !== (editingMember.membership_start || "") ||
      (values.membership_end || "") !== (editingMember.membership_end || "");

    try {
      let updatedMember: Member | undefined;

      // First, update basic fields via PATCH
      updatedMember = await updateMutation.mutateAsync({ id: editingMember.id, data: payload });

      // Then, if membership fields changed, call the override API
      if (membershipChanged) {
        const overridePayload: { membership_plan?: string; membership_start?: string; membership_end?: string; version?: number } = {
          version: updatedMember?.version ?? editingMember.version,
        };
        if ((values.membership_plan || "") !== (editingMember.membership_plan || "")) {
          overridePayload.membership_plan = values.membership_plan || undefined;
        }
        if ((values.membership_start || "") !== (editingMember.membership_start || "")) {
          overridePayload.membership_start = values.membership_start || undefined;
        }
        if ((values.membership_end || "") !== (editingMember.membership_end || "")) {
          overridePayload.membership_end = values.membership_end || undefined;
        }
        updatedMember = await memberService.overrideMembership(editingMember.id, overridePayload);
      }

      if (updatedMember && values.photoFile) {
        try {
          await memberService.uploadPhoto(updatedMember.id, values.photoFile);
          toast.success("Member and photo updated successfully!");
        } catch (err) {
          console.error("Failed to upload member photo:", err);
          toast.error("Member updated successfully, but photo upload failed.");
        }
      } else {
        toast.success("Member updated successfully!");
      }
    } catch (err) {
      console.error("Update failed:", err);
      throw err;
    }
    setEditingMember(null);
  };

  const handleDelete = async () => {
    if (!deletingMember) return;
    await deleteMutation.mutateAsync(deletingMember.id);
    setDeletingMember(null);
  };

  const columns = useMemo<ColumnDef<Member>[]>(
    () => [
      ...(isAdminOrAbove
        ? [
            {
              id: "select",
              header: () => (
                <input
                  type="checkbox"
                  checked={members.length > 0 && selectedIds.size === members.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300"
                  aria-label="Select all"
                />
              ),
              cell: ({ row }: { row: { original: Member } }) => (
                <input
                  type="checkbox"
                  checked={selectedIds.has(row.original.id)}
                  onChange={() => toggleSelect(row.original.id)}
                  className="h-4 w-4 rounded border-gray-300"
                  aria-label={`Select ${row.original.name}`}
                />
              ),
            } as ColumnDef<Member>,
          ]
        : []),
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => {
          const photoUrl = row.original.photo_url
            ? `${row.original.photo_url}?v=${row.original.version || 0}`
            : null;
          return (
            <Link href={`/members/${row.original.id}`} className="flex items-center gap-2 font-medium text-primary hover:underline">
              <span className="h-7 w-7 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                {photoUrl ? (
                  <Image src={photoUrl} alt="" width={28} height={28} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </span>
              <span>
                {row.original.name}
              </span>
            </Link>
          );
        },
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
        accessorKey: "batch",
        header: "Batch",
        cell: ({ row }) => (
          <span className="capitalize text-muted-foreground">
            {row.original.batch || "—"}
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
    [isAdminOrAbove, selectedIds, members, toggleSelect, toggleSelectAll]
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
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground text-sm mt-1">
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
              size="sm"
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
              size="sm"
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

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="pl-9 h-9"
            aria-label="Search members"
          />
        </div>
        <ColumnFilters
          definitions={filterDefinitions}
          values={filterValues}
          onChange={handleFilterChange}
          onClear={handleClearAllFilters}
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

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="frozen">Frozen</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Button
            size="sm"
            disabled={bulkLoading}
            onClick={handleBulkStatusChange}
          >
            {bulkLoading ? "Updating..." : "Change Status"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Create Form (animated entrance — UI/UX Pro Max: modal-motion) */}
      <AnimatePresence mode="wait">
        {showCreateForm && (
          <motion.div
            key="create-form"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <MemberForm
              title="Add New Member"
              submitLabel="Add Member"
              onSubmit={handleCreate}
              onCancel={() => setShowCreateForm(false)}
              isPending={createMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Form (animated entrance — UI/UX Pro Max: modal-motion) */}
      <AnimatePresence mode="wait">
        {editingMember && (
          <motion.div
            key={`edit-${editingMember.id}`}
            ref={editFormRef}
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <MemberForm
              key={editingMember.id}
              title={`Edit: ${editingMember.name}`}
              submitLabel="Save Changes"
              isEditing
              defaultValues={memberToFormValues(editingMember).formValues}
              defaultCustomFields={memberToFormValues(editingMember).customFieldValues}
              initialPhotoUrl={editingMember.photo_url}
              onSubmit={handleEdit}
              onCancel={() => setEditingMember(null)}
              isPending={updateMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>

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
                  <thead className="border-b bg-muted/30 dark:bg-muted/15">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th
                            key={header.id}
                            scope="col"
                            className="px-4 py-3.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="hover:bg-primary/[0.02] dark:hover:bg-primary/[0.04] transition-colors duration-150">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3.5">
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
            {members.map((member) => {
              const mobilePhotoUrl = member.photo_url
                ? `${member.photo_url}?v=${member.version || 0}`
                : null;
              return (
              <Card key={member.id} className="hover:shadow-soft-md hover:-translate-y-0.5 transition-all duration-250 ease-spring gradient-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (mobilePhotoUrl) {
                            setPreviewPhoto({ url: mobilePhotoUrl, name: member.name });
                          }
                        }}
                        className={mobilePhotoUrl ? "cursor-pointer" : "cursor-default"}
                        aria-label={mobilePhotoUrl ? `View ${member.name}'s photo` : undefined}
                      >
                        <motion.span
                          layoutId={`member-avatar-${member.id}`}
                          className="h-12 w-12 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0 ring-2 ring-border/50"
                        >
                          {mobilePhotoUrl ? (
                            <Image src={mobilePhotoUrl} alt="" width={48} height={48} className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <User className="h-5 w-5 text-muted-foreground" />
                          )}
                        </motion.span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/members/${member.id}`}
                          className="font-medium text-primary hover:underline truncate block"
                        >
                          <motion.span layoutId={`member-name-${member.id}`}>
                            {member.name}
                          </motion.span>
                        </Link>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {member.phone}
                        </p>
                      </div>
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
              );
            })}
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

      {/* Photo Preview Modal (Mobile) */}
      <AnimatePresence>
        {previewPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setPreviewPhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative max-w-xs w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setPreviewPhoto(null)}
                className="absolute -top-10 right-0 rounded-full bg-white/20 p-1.5 text-white hover:bg-white/30 transition-colors"
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="overflow-hidden rounded-xl shadow-2xl">
                <Image
                  src={previewPhoto.url}
                  alt={previewPhoto.name}
                  width={320}
                  height={320}
                  className="w-full h-auto object-cover"
                />
              </div>
              <p className="mt-3 text-center text-sm font-medium text-white">
                {previewPhoto.name}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

function formValuesToPayload(values: MemberFormValues & { custom_fields?: Record<string, string | number | null> }): CreateMemberPayload {
  const payload: CreateMemberPayload = {
    name: values.name,
    phone: values.phone,
  };
  if (values.email) payload.email = values.email;
  const gender = values.gender;
  if (gender === "male" || gender === "female" || gender === "other") {
    payload.gender = gender;
  }

  if (values.date_of_birth) payload.date_of_birth = values.date_of_birth;
  if (values.father_name) payload.father_name = values.father_name;
  const batch = values.batch;
  if (batch === "morning" || batch === "afternoon" || batch === "evening") {
    payload.batch = batch;
  }
  if (values.emergency_contact) payload.emergency_contact = values.emergency_contact;
  if (values.custom_fields && Object.keys(values.custom_fields).length > 0) {
    payload.custom_fields = values.custom_fields;
  }
  return payload;
}
