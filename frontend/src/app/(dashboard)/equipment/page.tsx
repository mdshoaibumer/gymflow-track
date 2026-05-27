"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Plus, Wrench, History, Pencil, CheckCircle, XCircle, Archive, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  useAssets,
  useAssetStats,
  useCreateAsset,
  useUpdateAsset,
  useUpdateAssetStatus,
  useCompleteMaintenance,
  useRecordMaintenance,
  useMaintenanceHistory,
} from "@/hooks/use-assets";
import type {
  Asset,
  AssetStatus,
  AssetCategory,
  CreateAssetPayload,
  CreateMaintenancePayload,
} from "@/services/asset.service";
import { assetFormSchema, type AssetFormValues } from "@/lib/validations/asset";
import { DashboardCard } from "@/components/layout/dashboard-card";
import { formatPaise } from "@/lib/utils";
import { RoleGate } from "@/components/role-gate";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Active",
  under_maintenance: "Maintenance",
  out_of_service: "Out of Service",
  retired: "Retired",
};

const STATUS_VARIANTS: Record<AssetStatus, "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  under_maintenance: "warning",
  out_of_service: "destructive",
  retired: "secondary",
};

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  cardio: "Cardio",
  strength: "Strength",
  free_weights: "Free Weights",
  functional: "Functional",
  accessories: "Accessories",
  facility: "Facility",
  other: "Other",
};

const MAINT_TYPE_LABELS: Record<string, string> = {
  preventive: "Preventive",
  corrective: "Repair",
  inspection: "Inspection",
  warranty: "Warranty",
};

type ModalState =
  | { type: "none" }
  | { type: "add" }
  | { type: "edit"; asset: Asset }
  | { type: "maintenance"; asset: Asset }
  | { type: "history"; asset: Asset };

type ConfirmAction =
  | { type: "none" }
  | { type: "out_of_service"; asset: Asset }
  | { type: "retire"; asset: Asset };

type SortField = "name" | "category" | "status" | "warranty_expiry" | "purchase_cost_in_paise";
type SortDirection = "asc" | "desc";

// ── Helpers ─────────────────────────────────────────────────

function isWarrantyExpiringSoon(warranty_expiry: string | null): boolean {
  if (!warranty_expiry) return false;
  const expiry = new Date(warranty_expiry);
  const now = new Date();
  const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 30;
}

function isWarrantyExpired(warranty_expiry: string | null): boolean {
  if (!warranty_expiry) return false;
  return new Date(warranty_expiry) < new Date();
}

function exportToCSV(assets: Asset[]) {
  const headers = [
    "Name",
    "Code",
    "Category",
    "Status",
    "Manufacturer",
    "Serial Number",
    "Purchase Date",
    "Purchase Cost (₹)",
    "Warranty Expiry",
    "Notes",
  ];

  const rows = assets.map((a) => [
    a.name,
    a.asset_code,
    CATEGORY_LABELS[a.category] || a.category,
    STATUS_LABELS[a.status] || a.status,
    a.manufacturer || "",
    a.serial_number || "",
    a.purchase_date || "",
    a.purchase_cost_in_paise != null ? (a.purchase_cost_in_paise / 100).toFixed(2) : "",
    a.warranty_expiry || "",
    a.notes || "",
  ]);

  const csvContent = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `equipment_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Main Page Component ─────────────────────────────────────

export default function EquipmentPage() {
  const { isAdminOrAbove } = useAuth();
  const [filterStatus, setFilterStatus] = useState<AssetStatus | "">("");
  const [filterCategory, setFilterCategory] = useState<AssetCategory | "">("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>({ type: "none" });

  // Pagination state
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on filter changes
  useEffect(() => {
    setPage(0);
  }, [filterStatus, filterCategory]);

  const { data: assetsData, isLoading } = useAssets({
    skip: page * pageSize,
    limit: pageSize,
    status: filterStatus || undefined,
    category: filterCategory || undefined,
    search: debouncedSearch || undefined,
  });
  const { data: stats } = useAssetStats();

  const assets = useMemo(() => assetsData?.assets ?? [], [assetsData?.assets]);
  const total = assetsData?.total ?? 0;

  // Client-side sorting (server already did filtering/pagination)
  const sortedAssets = useMemo(() => {
    return [...assets].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "category":
          comparison = (CATEGORY_LABELS[a.category] || "").localeCompare(
            CATEGORY_LABELS[b.category] || ""
          );
          break;
        case "status":
          comparison = (STATUS_LABELS[a.status] || "").localeCompare(
            STATUS_LABELS[b.status] || ""
          );
          break;
        case "warranty_expiry": {
          const aDate = a.warranty_expiry ? new Date(a.warranty_expiry).getTime() : 0;
          const bDate = b.warranty_expiry ? new Date(b.warranty_expiry).getTime() : 0;
          comparison = aDate - bDate;
          break;
        }
        case "purchase_cost_in_paise":
          comparison = (a.purchase_cost_in_paise ?? 0) - (b.purchase_cost_in_paise ?? 0);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [assets, sortField, sortDirection]);

  const createMutation = useCreateAsset();
  const updateMutation = useUpdateAsset();
  const statusMutation = useUpdateAssetStatus();
  const completeMutation = useCompleteMaintenance();
  const maintenanceMutation = useRecordMaintenance();

  // Handle column sort toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Render sort icon for column headers
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  };

  // Execute confirmed destructive action
  const executeConfirmAction = () => {
    if (confirmAction.type === "out_of_service") {
      statusMutation.mutate({ id: confirmAction.asset.id, status: "out_of_service" });
    } else if (confirmAction.type === "retire") {
      statusMutation.mutate({ id: confirmAction.asset.id, status: "retired" });
    }
    setConfirmAction({ type: "none" });
  };

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
          <h1 className="text-2xl font-bold tracking-tight text-gradient-subtle">Equipment</h1>
          <p className="text-sm text-muted-foreground">
            Track gym assets, maintenance, and service history.
          </p>
        </div>
        <div className="flex gap-2">
          {assets.length > 0 && (
            <Button variant="outline" onClick={() => exportToCSV(assets)}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
          <RoleGate allowed={["owner", "admin"]}>
            <Button onClick={() => setModal({ type: "add" })}>
              <Plus className="mr-2 h-4 w-4" />
              Add Equipment
            </Button>
          </RoleGate>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardCard
            title="Active Equipment"
            value={String(stats.active_count)}
            description={`${stats.total_count} total`}
          />
          <DashboardCard
            title="Under Maintenance"
            value={String(stats.under_maintenance_count)}
            description={
              stats.out_of_service_count > 0
                ? `${stats.out_of_service_count} out of service`
                : "All operational"
            }
          />
          <DashboardCard
            title="Upcoming Services"
            value={String(stats.upcoming_maintenance)}
            description={
              stats.overdue_maintenance > 0
                ? `${stats.overdue_maintenance} overdue!`
                : "None overdue"
            }
          />
          <DashboardCard
            title="Maintenance Cost"
            value={formatPaise(stats.maintenance_cost_this_month_paise)}
            description="This month"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          value={filterStatus || "all"}
          onValueChange={(v) => setFilterStatus(v === "all" ? "" : (v as AssetStatus))}
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterCategory || "all"}
          onValueChange={(v) => setFilterCategory(v === "all" ? "" : (v as AssetCategory))}
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or code..."
          className="w-full sm:w-[200px]"
        />
        <span className="text-xs text-muted-foreground">
          {total} equipment{total !== 1 ? " items" : ""}
        </span>
      </div>

      {/* Assets Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-0">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : assets.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No equipment found"
          description={
            search || filterStatus || filterCategory
              ? "Try adjusting your filters."
              : "Add your first piece of equipment to get started."
          }
          action={
            !search && !filterStatus && !filterCategory && isAdminOrAbove
              ? { label: "Add Equipment", onClick: () => setModal({ type: "add" }), icon: Plus }
              : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Desktop table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-sm" role="table">
                <caption className="sr-only">Gym equipment inventory</caption>
                <thead className="border-b bg-muted/30 dark:bg-muted/15">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("name")}
                    >
                      <span className="inline-flex items-center">
                        Equipment
                        <SortIcon field="name" />
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("category")}
                    >
                      <span className="inline-flex items-center">
                        Category
                        <SortIcon field="category" />
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("status")}
                    >
                      <span className="inline-flex items-center">
                        Status
                        <SortIcon field="status" />
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("warranty_expiry")}
                    >
                      <span className="inline-flex items-center">
                        Warranty
                        <SortIcon field="warranty_expiry" />
                      </span>
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {sortedAssets.map((a) => (
                    <tr key={a.id} className="hover:bg-primary/[0.02] dark:hover:bg-primary/[0.04] transition-colors duration-150">
                      <td className="px-4 py-3">
                        <p className="font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.asset_code}
                          {a.manufacturer && ` · ${a.manufacturer}`}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {CATEGORY_LABELS[a.category] || a.category}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANTS[a.status]}>
                          {STATUS_LABELS[a.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <WarrantyBadge warranty_expiry={a.warranty_expiry} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="History"
                            onClick={() => setModal({ type: "history", asset: a })}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          {isAdminOrAbove && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Service"
                                onClick={() => setModal({ type: "maintenance", asset: a })}
                              >
                                <Wrench className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Edit"
                                onClick={() => setModal({ type: "edit", asset: a })}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {a.status === "under_maintenance" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-green-600"
                                  title="Complete Maintenance"
                                  onClick={() => completeMutation.mutate(a.id)}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              )}
                              {a.status === "active" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  title="Mark Out of Service"
                                  onClick={() =>
                                    setConfirmAction({ type: "out_of_service", asset: a })
                                  }
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              )}
                              {a.status === "out_of_service" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Retire"
                                  onClick={() =>
                                    setConfirmAction({ type: "retire", asset: a })
                                  }
                                >
                                  <Archive className="h-4 w-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 p-4 md:hidden">
              {sortedAssets.map((a) => (
                <div key={a.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.asset_code}{a.manufacturer && ` · ${a.manufacturer}`}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANTS[a.status]} className="text-xs shrink-0">
                      {STATUS_LABELS[a.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{CATEGORY_LABELS[a.category] || a.category}</span>
                    <WarrantyBadge warranty_expiry={a.warranty_expiry} />
                  </div>
                  <div className="flex gap-1 pt-1 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 text-xs"
                      onClick={() => setModal({ type: "history", asset: a })}
                    >
                      <History className="mr-1 h-3 w-3" />
                      History
                    </Button>
                    {isAdminOrAbove && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 text-xs"
                          onClick={() => setModal({ type: "maintenance", asset: a })}
                        >
                          <Wrench className="mr-1 h-3 w-3" />
                          Service
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 text-xs"
                          onClick={() => setModal({ type: "edit", asset: a })}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        {a.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 text-xs text-destructive"
                            onClick={() =>
                              setConfirmAction({ type: "out_of_service", asset: a })
                            }
                          >
                            <XCircle className="mr-1 h-3 w-3" />
                            Out of Service
                          </Button>
                        )}
                        {a.status === "out_of_service" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 text-xs"
                            onClick={() =>
                              setConfirmAction({ type: "retire", asset: a })
                            }
                          >
                            <Archive className="mr-1 h-3 w-3" />
                            Retire
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>

          {/* Pagination */}
          {total > pageSize && (
            <div className="border-t px-4 py-3">
              <PaginationControls
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(0);
                }}
              />
            </div>
          )}
        </Card>
      )}

      {/* Confirmation Dialog for Destructive Actions */}
      <AlertDialog
        open={confirmAction.type !== "none"}
        onOpenChange={(open) => !open && setConfirmAction({ type: "none" })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction.type === "retire"
                ? "Retire Equipment?"
                : "Mark Out of Service?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction.type === "retire" ? (
                <>
                  This will permanently retire{" "}
                  <strong>{confirmAction.asset.name}</strong>.
                  Retired equipment cannot be reactivated.
                </>
              ) : confirmAction.type === "out_of_service" ? (
                <>
                  This will mark{" "}
                  <strong>{confirmAction.asset.name}</strong>{" "}
                  as out of service. It must be repaired before it can be used again.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeConfirmAction}
              className={
                confirmAction.type === "retire"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {confirmAction.type === "retire" ? "Retire" : "Mark Out of Service"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Asset Dialog */}
      {(modal.type === "add" || modal.type === "edit") && (
        <AssetFormDialog
          asset={modal.type === "edit" ? modal.asset : undefined}
          loading={createMutation.isPending || updateMutation.isPending}
          onSubmit={(data) =>
            modal.type === "edit"
              ? updateMutation.mutateAsync({ id: modal.asset.id, data }).then(() =>
                  setModal({ type: "none" })
                )
              : createMutation.mutateAsync(data as CreateAssetPayload).then(() =>
                  setModal({ type: "none" })
                )
          }
          onClose={() => setModal({ type: "none" })}
        />
      )}

      {/* Record Maintenance Dialog */}
      {modal.type === "maintenance" && (
        <MaintenanceFormDialog
          asset={modal.asset}
          loading={maintenanceMutation.isPending}
          onSubmit={(data) =>
            maintenanceMutation
              .mutateAsync({ assetId: modal.asset.id, data })
              .then(() => setModal({ type: "none" }))
          }
          onClose={() => setModal({ type: "none" })}
        />
      )}

      {/* Maintenance History Dialog */}
      {modal.type === "history" && (
        <HistoryDialog
          asset={modal.asset}
          onClose={() => setModal({ type: "none" })}
        />
      )}
    </motion.div>
  );
}

// === Warranty Badge Component ===

function WarrantyBadge({ warranty_expiry }: { warranty_expiry: string | null }) {
  if (!warranty_expiry) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const dateStr = new Date(warranty_expiry).toLocaleDateString("en-IN");

  if (isWarrantyExpired(warranty_expiry)) {
    return (
      <Badge variant="destructive" className="text-xs">
        Expired {dateStr}
      </Badge>
    );
  }

  if (isWarrantyExpiringSoon(warranty_expiry)) {
    return (
      <Badge variant="warning" className="text-xs animate-pulse">
        Expires {dateStr}
      </Badge>
    );
  }

  return <span className="text-xs text-muted-foreground">{dateStr}</span>;
}

// === Dialog Components ===

function AssetFormDialog({
  asset,
  loading,
  onSubmit,
  onClose,
}: {
  asset?: Asset;
  loading: boolean;
  onSubmit: (data: Partial<CreateAssetPayload>) => void;
  onClose: () => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      name: asset?.name ?? "",
      asset_code: asset?.asset_code ?? "",
      category: asset?.category ?? "cardio",
      manufacturer: asset?.manufacturer ?? "",
      serial_number: asset?.serial_number ?? "",
      purchase_date: asset?.purchase_date ?? "",
      purchase_cost_in_paise: asset?.purchase_cost_in_paise ?? undefined,
      warranty_expiry: asset?.warranty_expiry ?? "",
      notes: asset?.notes ?? "",
    },
  });

  const onFormSubmit = (data: AssetFormValues) => {
    onSubmit(data as Partial<CreateAssetPayload>);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{asset ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
          <DialogDescription>
            {asset ? "Update equipment details." : "Add a new piece of equipment to your gym."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                {...register("name")}
                placeholder="Treadmill #1"
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Code *</Label>
              <Input
                {...register("asset_code")}
                placeholder="TM-001"
              />
              {errors.asset_code && (
                <p className="text-xs text-destructive">{errors.asset_code.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.category && (
                <p className="text-xs text-destructive">{errors.category.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Manufacturer</Label>
              <Input {...register("manufacturer")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Purchase Date</Label>
              <Input
                type="date"
                {...register("purchase_date")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cost (₹)</Label>
              <Controller
                name="purchase_cost_in_paise"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    value={
                      field.value !== undefined && field.value !== null
                        ? String(field.value / 100)
                        : ""
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        field.onChange(undefined);
                      } else {
                        field.onChange(Math.round(Number(val) * 100));
                      }
                    }}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                )}
              />
              {errors.purchase_cost_in_paise && (
                <p className="text-xs text-destructive">{errors.purchase_cost_in_paise.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Serial Number</Label>
              <Input {...register("serial_number")} />
            </div>
            <div className="space-y-1.5">
              <Label>Warranty Expiry</Label>
              <Input
                type="date"
                {...register("warranty_expiry")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              {...register("notes")}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : asset ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceFormDialog({
  asset,
  loading,
  onSubmit,
  onClose,
}: {
  asset: Asset;
  loading: boolean;
  onSubmit: (data: CreateMaintenancePayload) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CreateMaintenancePayload>({
    maintenance_type: "preventive",
    service_date: new Date().toISOString().split("T")[0],
    cost_in_paise: undefined,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Maintenance</DialogTitle>
          <DialogDescription>
            {asset.name} ({asset.asset_code})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select
                value={form.maintenance_type}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    maintenance_type: v as CreateMaintenancePayload["maintenance_type"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MAINT_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Service Date *</Label>
              <Input
                type="date"
                value={form.service_date}
                onChange={(e) => setForm({ ...form, service_date: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cost (₹)</Label>
              <Input
                type="number"
                value={
                  form.cost_in_paise !== undefined && form.cost_in_paise !== null
                    ? String(form.cost_in_paise / 100)
                    : ""
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") {
                    setForm({ ...form, cost_in_paise: undefined });
                  } else {
                    setForm({ ...form, cost_in_paise: Math.round(Number(val) * 100) });
                  }
                }}
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Next Service</Label>
              <Input
                type="date"
                value={form.next_service_date || ""}
                onChange={(e) =>
                  setForm({ ...form, next_service_date: e.target.value || undefined })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <Input
              value={form.vendor_name || ""}
              onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
              placeholder="Service provider name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="What was done, parts replaced, etc."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit(form)}
            disabled={loading || !form.service_date}
          >
            {loading ? "Saving..." : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  asset,
  onClose,
}: {
  asset: Asset;
  onClose: () => void;
}) {
  const { data, isLoading } = useMaintenanceHistory(asset.id);
  const records = data?.records ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Maintenance History</DialogTitle>
          <DialogDescription>
            {asset.name} ({asset.asset_code})
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No maintenance records yet.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y">
            {records.map((r) => (
              <div key={r.id} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">
                    {MAINT_TYPE_LABELS[r.maintenance_type] || r.maintenance_type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.service_date).toLocaleDateString("en-IN")}
                  </span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                  {r.cost_in_paise > 0 && (
                    <span>{formatPaise(r.cost_in_paise)}</span>
                  )}
                  {r.vendor_name && <span>{r.vendor_name}</span>}
                  {r.next_service_date && (
                    <span>
                      Next: {new Date(r.next_service_date).toLocaleDateString("en-IN")}
                    </span>
                  )}
                </div>
                {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
