"use client";

import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { Pencil, ShieldOff, ShieldCheck } from "lucide-react";
import type { StaffUser } from "@/services/user.service";
import { RoleBadge } from "@/components/staff/role-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StaffTableProps {
  users: StaffUser[];
  isLoading: boolean;
  currentUserId: string | undefined;
  isOwner: boolean;
  onEdit: (user: StaffUser) => void;
  onToggleStatus: (user: StaffUser) => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function StaffTable({
  users,
  isLoading,
  currentUserId,
  isOwner,
  onEdit,
  onToggleStatus,
}: StaffTableProps) {
  const columns = useMemo<ColumnDef<StaffUser>[]>(
    () => [
      {
        id: "avatar",
        header: "",
        size: 48,
        cell: ({ row }) => (
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {getInitials(row.original.name)}
            </AvatarFallback>
          </Avatar>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="min-w-[120px]">
            <p className="font-medium truncate max-w-[200px]">{row.original.name}</p>
            {/* Show email below name on mobile-ish widths via the table cell */}
            <p className="text-xs text-muted-foreground truncate max-w-[200px] sm:hidden">
              {row.original.email}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="text-muted-foreground truncate max-w-[200px] block">
            {row.original.email}
          </span>
        ),
        meta: { className: "hidden sm:table-cell" },
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.phone}</span>
        ),
        meta: { className: "hidden md:table-cell" },
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => <RoleBadge role={row.original.role} />,
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant={row.original.is_active ? "success" : "secondary"}
            className="capitalize"
          >
            {row.original.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      ...(isOwner
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }: { row: { original: StaffUser } }) => {
                const user = row.original;
                const isSelf = user.id === currentUserId;
                const isOwnerUser = user.role === "owner";
                return (
                  <div className="flex justify-end gap-1">
                    {!isOwnerUser && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEdit(user)}
                        aria-label={`Edit ${user.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {!isOwnerUser && !isSelf && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 ${user.is_active ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}`}
                        onClick={() => onToggleStatus(user)}
                        aria-label={
                          user.is_active
                            ? `Deactivate ${user.name}`
                            : `Activate ${user.name}`
                        }
                      >
                        {user.is_active ? (
                          <ShieldOff className="h-4 w-4" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                );
              },
            } as ColumnDef<StaffUser>,
          ]
        : []),
    ],
    [isOwner, currentUserId, onEdit, onToggleStatus]
  );

  const table = useReactTable({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b px-4 py-4 last:border-0"
              >
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36 hidden sm:block" />
                <Skeleton className="h-4 w-24 hidden md:block" />
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Desktop table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm" role="table">
            <caption className="sr-only">Staff members</caption>
            <thead className="border-b bg-muted/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta as
                      | { className?: string }
                      | undefined;
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={`px-4 py-3 text-left font-medium text-muted-foreground ${meta?.className ?? ""}`}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      | { className?: string }
                      | undefined;
                    return (
                      <td
                        key={cell.id}
                        className={`px-4 py-3 ${meta?.className ?? ""}`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 p-4 md:hidden">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-lg border p-3">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {getInitials(u.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{u.name}</p>
                  <RoleBadge role={u.role} />
                </div>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                {u.phone && (
                  <p className="text-xs text-muted-foreground">{u.phone}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge
                  variant={u.is_active ? "success" : "secondary"}
                  className="capitalize text-xs"
                >
                  {u.is_active ? "Active" : "Inactive"}
                </Badge>
                {isOwner && u.role !== "owner" && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => onEdit(u)}
                      aria-label={`Edit ${u.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {u.id !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-9 w-9 ${u.is_active ? "text-destructive" : "text-green-600"}`}
                        onClick={() => onToggleStatus(u)}
                        aria-label={u.is_active ? `Deactivate ${u.name}` : `Activate ${u.name}`}
                      >
                        {u.is_active ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
