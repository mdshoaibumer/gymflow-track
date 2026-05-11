"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { UserPlus, AlertCircle, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUsers, useCreateUser, useUpdateUser, useDeactivateUser } from "@/hooks/use-users";
import type { StaffUser, UpdateUserPayload } from "@/services/user.service";
import type { UserRole } from "@/types";
import { StaffTable } from "@/components/staff/staff-table";
import { StaffFilters } from "@/components/staff/staff-filters";
import { StaffEmptyState } from "@/components/staff/empty-state";
import { AddStaffDialog } from "@/components/staff/add-staff-dialog";
import { EditStaffDialog } from "@/components/staff/edit-staff-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function StaffPage() {
  const router = useRouter();
  const { user, isOwner, role, isLoading: authLoading } = useAuth();

  // RBAC: Only owner can access this page
  useEffect(() => {
    if (!authLoading && role && role !== "owner") {
      router.replace("/dashboard");
    }
  }, [authLoading, role, router]);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // React Query
  const { data: users, isLoading, isError, refetch } = useUsers();

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deactivateMutation = useDeactivateUser();

  // Client-side filtering (backend returns flat list; we filter locally)
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    let result = [...users];

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
      );
    }

    if (roleFilter !== "all") {
      result = result.filter((u) => u.role === roleFilter);
    }

    if (statusFilter !== "all") {
      const wantActive = statusFilter === "active";
      result = result.filter((u) => u.is_active === wantActive);
    }

    return result;
  }, [users, debouncedSearch, roleFilter, statusFilter]);

  const hasActiveFilters =
    !!debouncedSearch || roleFilter !== "all" || statusFilter !== "all";

  const clearFilters = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
  }, []);

  // Handlers
  const handleCreate = useCallback(
    async (data: {
      name: string;
      email: string;
      phone: string;
      password: string;
      role: UserRole;
    }) => {
      await createMutation.mutateAsync(data);
    },
    [createMutation]
  );

  const handleEdit = useCallback(
    async (id: string, data: UpdateUserPayload) => {
      await updateMutation.mutateAsync({ id, data });
    },
    [updateMutation]
  );

  const handleToggleStatus = useCallback(
    (targetUser: StaffUser) => {
      // Prevent owner self-deactivation
      if (targetUser.id === user?.id) {
        toast.error("You cannot deactivate your own account");
        return;
      }

      if (targetUser.role === "owner") {
        toast.error("Cannot modify the gym owner");
        return;
      }

      if (targetUser.is_active) {
        // Deactivate
        deactivateMutation.mutate(targetUser.id);
      } else {
        // Re-activate via update
        updateMutation.mutate({ id: targetUser.id, data: { is_active: true } });
      }
    },
    [user?.id, deactivateMutation, updateMutation]
  );

  // Guard: don't render page content for non-owners
  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (role !== "owner") {
    return null;
  }

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
          <h1 className="text-2xl font-bold tracking-tight">Staff Management</h1>
          <p className="text-muted-foreground text-sm">
            {users
              ? `${users.length} user${users.length !== 1 ? "s" : ""} in your gym`
              : "Manage your gym's staff and admin accounts"}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Staff
        </Button>
      </div>

      {/* Filters */}
      <StaffFilters
        search={search}
        onSearchChange={setSearch}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Error state */}
      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-destructive/10 p-3 mb-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold">Failed to load staff</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Something went wrong. Please try again.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {!isError && filteredUsers.length === 0 && !isLoading ? (
        <StaffEmptyState
          hasFilters={hasActiveFilters}
          onClearFilters={clearFilters}
          onAddStaff={() => setAddOpen(true)}
        />
      ) : !isError ? (
        <StaffTable
          users={filteredUsers}
          isLoading={isLoading}
          currentUserId={user?.id}
          isOwner={isOwner}
          onEdit={(u) => setEditingUser(u)}
          onToggleStatus={handleToggleStatus}
        />
      ) : null}

      {/* Add Staff Dialog */}
      <AddStaffDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
      />

      {/* Edit Staff Dialog */}
      <EditStaffDialog
        user={editingUser}
        open={!!editingUser}
        onOpenChange={(open) => {
          if (!open) setEditingUser(null);
        }}
        onSubmit={handleEdit}
        isPending={updateMutation.isPending}
        currentUserId={user?.id}
      />
    </motion.div>
  );
}
