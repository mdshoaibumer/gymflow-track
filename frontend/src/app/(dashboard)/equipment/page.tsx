"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  assetService,
  type Asset,
  type AssetDashboardStats,
  type AssetStatus,
  type AssetCategory,
  type MaintenanceRecord,
  type CreateAssetPayload,
  type CreateMaintenancePayload,
} from "@/services/asset.service";
import { DashboardCard } from "@/components/layout/dashboard-card";

const STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Active",
  under_maintenance: "Maintenance",
  out_of_service: "Out of Service",
  retired: "Retired",
};

const STATUS_COLORS: Record<AssetStatus, string> = {
  active: "bg-green-100 text-green-800",
  under_maintenance: "bg-yellow-100 text-yellow-800",
  out_of_service: "bg-red-100 text-red-800",
  retired: "bg-gray-100 text-gray-800",
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

type ModalState =
  | { type: "none" }
  | { type: "add" }
  | { type: "edit"; asset: Asset }
  | { type: "maintenance"; asset: Asset }
  | { type: "history"; asset: Asset };

export default function EquipmentPage() {
  const { token, user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stats, setStats] = useState<AssetDashboardStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<AssetStatus | "">("");
  const [filterCategory, setFilterCategory] = useState<AssetCategory | "">("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [actionLoading, setActionLoading] = useState(false);

  // Maintenance history state
  const [historyRecords, setHistoryRecords] = useState<MaintenanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isAdminOrAbove = user?.role === "owner" || user?.role === "admin";

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        assetService.list(token, {
          status: filterStatus || undefined,
          category: filterCategory || undefined,
          search: search || undefined,
        }),
        assetService.stats(token),
      ]);
      setAssets(listRes.assets);
      setTotal(listRes.total);
      setStats(statsRes);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus, filterCategory, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadHistory = async (assetId: string) => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const res = await assetService.getMaintenanceHistory(token, assetId);
      setHistoryRecords(res.records);
    } catch {
      setHistoryRecords([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleCreateAsset = async (data: CreateAssetPayload) => {
    if (!token) return;
    setActionLoading(true);
    try {
      await assetService.create(token, data);
      setModal({ type: "none" });
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create asset");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateAsset = async (id: string, data: Partial<CreateAssetPayload>) => {
    if (!token) return;
    setActionLoading(true);
    try {
      await assetService.update(token, id, data);
      setModal({ type: "none" });
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update asset");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordMaintenance = async (assetId: string, data: CreateMaintenancePayload) => {
    if (!token) return;
    setActionLoading(true);
    try {
      await assetService.recordMaintenance(token, assetId, data);
      setModal({ type: "none" });
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to record maintenance");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteMaintenance = async (id: string) => {
    if (!token) return;
    try {
      await assetService.completeMaintenance(token, id);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleStatusChange = async (id: string, newStatus: AssetStatus) => {
    if (!token) return;
    try {
      await assetService.updateStatus(token, id, newStatus);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipment</h1>
          <p className="text-sm text-muted-foreground">
            Track gym assets, maintenance, and service history.
          </p>
        </div>
        {isAdminOrAbove && (
          <button
            onClick={() => setModal({ type: "add" })}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add Equipment
          </button>
        )}
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
            description={stats.out_of_service_count > 0 ? `${stats.out_of_service_count} out of service` : "All operational"}
          />
          <DashboardCard
            title="Upcoming Services"
            value={String(stats.upcoming_maintenance)}
            description={stats.overdue_maintenance > 0 ? `${stats.overdue_maintenance} overdue!` : "None overdue"}
          />
          <DashboardCard
            title="Maintenance Cost"
            value={`₹${(stats.maintenance_cost_this_month_paise / 100).toLocaleString("en-IN")}`}
            description="This month"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as AssetStatus | "")}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          <option value="">All Status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as AssetCategory | "")}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or code..."
          className="rounded-md border px-3 py-1.5 text-sm"
        />
        <span className="text-xs text-muted-foreground">
          {total} equipment{total !== 1 ? " items" : ""}
        </span>
      </div>

      {/* Assets Table */}
      {loading ? (
        <div className="py-10 text-center text-muted-foreground">Loading...</div>
      ) : assets.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          No equipment found. {isAdminOrAbove && "Click \"Add Equipment\" to get started."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Equipment</th>
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Warranty</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {assets.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30">
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
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status]}`}>
                      {STATUS_LABELS[a.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {a.warranty_expiry
                      ? new Date(a.warranty_expiry).toLocaleDateString("en-IN")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setModal({ type: "history", asset: a }); loadHistory(a.id); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        History
                      </button>
                      {isAdminOrAbove && (
                        <>
                          <button
                            onClick={() => setModal({ type: "maintenance", asset: a })}
                            className="text-xs text-orange-600 hover:underline"
                          >
                            Service
                          </button>
                          <button
                            onClick={() => setModal({ type: "edit", asset: a })}
                            className="text-xs text-gray-600 hover:underline"
                          >
                            Edit
                          </button>
                          {a.status === "under_maintenance" && (
                            <button
                              onClick={() => handleCompleteMaintenance(a.id)}
                              className="text-xs text-green-600 hover:underline"
                            >
                              Done
                            </button>
                          )}
                          {a.status === "active" && (
                            <button
                              onClick={() => handleStatusChange(a.id, "out_of_service")}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Mark Down
                            </button>
                          )}
                          {a.status === "out_of_service" && (
                            <button
                              onClick={() => handleStatusChange(a.id, "retired")}
                              className="text-xs text-gray-500 hover:underline"
                            >
                              Retire
                            </button>
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
      )}

      {/* === MODALS === */}

      {/* Add/Edit Asset Modal */}
      {(modal.type === "add" || modal.type === "edit") && (
        <AssetFormModal
          asset={modal.type === "edit" ? modal.asset : undefined}
          loading={actionLoading}
          onSubmit={(data) =>
            modal.type === "edit"
              ? handleUpdateAsset(modal.asset.id, data)
              : handleCreateAsset(data as CreateAssetPayload)
          }
          onClose={() => setModal({ type: "none" })}
        />
      )}

      {/* Record Maintenance Modal */}
      {modal.type === "maintenance" && (
        <MaintenanceFormModal
          asset={modal.asset}
          loading={actionLoading}
          onSubmit={(data) => handleRecordMaintenance(modal.asset.id, data)}
          onClose={() => setModal({ type: "none" })}
        />
      )}

      {/* Maintenance History Modal */}
      {modal.type === "history" && (
        <HistoryModal
          asset={modal.asset}
          records={historyRecords}
          loading={historyLoading}
          onClose={() => setModal({ type: "none" })}
        />
      )}
    </div>
  );
}


// === Modal Components ===

function AssetFormModal({
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
  const [form, setForm] = useState<Partial<CreateAssetPayload>>({
    name: asset?.name ?? "",
    asset_code: asset?.asset_code ?? "",
    category: asset?.category ?? "cardio",
    manufacturer: asset?.manufacturer ?? "",
    serial_number: asset?.serial_number ?? "",
    purchase_date: asset?.purchase_date ?? "",
    purchase_cost_in_paise: asset?.purchase_cost_in_paise ?? undefined,
    warranty_expiry: asset?.warranty_expiry ?? "",
    notes: asset?.notes ?? "",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">
          {asset ? "Edit Equipment" : "Add Equipment"}
        </h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Name *</label>
              <input
                type="text"
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
                placeholder="Treadmill #1"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Code *</label>
              <input
                type="text"
                value={form.asset_code || ""}
                onChange={(e) => setForm({ ...form, asset_code: e.target.value })}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
                placeholder="TM-001"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Category *</label>
              <select
                value={form.category || "cardio"}
                onChange={(e) => setForm({ ...form, category: e.target.value as AssetCategory })}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Manufacturer</label>
              <input
                type="text"
                value={form.manufacturer || ""}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Purchase Date</label>
              <input
                type="date"
                value={form.purchase_date || ""}
                onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Cost (₹)</label>
              <input
                type="number"
                value={form.purchase_cost_in_paise != null ? form.purchase_cost_in_paise / 100 : ""}
                onChange={(e) => setForm({ ...form, purchase_cost_in_paise: e.target.value ? Math.round(Number(e.target.value) * 100) : undefined })}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
                placeholder="0"
                min="0"
                step="1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Serial Number</label>
              <input
                type="text"
                value={form.serial_number || ""}
                onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Warranty Expiry</label>
              <input
                type="date"
                value={form.warranty_expiry || ""}
                onChange={(e) => setForm({ ...form, warranty_expiry: e.target.value })}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Notes</label>
            <textarea
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
              rows={2}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={loading || !form.name || !form.asset_code}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Saving..." : asset ? "Update" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

const MAINT_TYPE_LABELS: Record<string, string> = {
  preventive: "Preventive",
  corrective: "Repair",
  inspection: "Inspection",
  warranty: "Warranty",
};

function MaintenanceFormModal({
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
    cost_in_paise: 0,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold">Record Maintenance</h2>
        <p className="mb-4 text-xs text-muted-foreground">{asset.name} ({asset.asset_code})</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Type *</label>
              <select
                value={form.maintenance_type}
                onChange={(e) => setForm({ ...form, maintenance_type: e.target.value as CreateMaintenancePayload["maintenance_type"] })}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
              >
                {Object.entries(MAINT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Service Date *</label>
              <input
                type="date"
                value={form.service_date}
                onChange={(e) => setForm({ ...form, service_date: e.target.value })}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Cost (₹)</label>
              <input
                type="number"
                value={(form.cost_in_paise ?? 0) / 100}
                onChange={(e) => setForm({ ...form, cost_in_paise: Math.round(Number(e.target.value) * 100) })}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
                min="0"
                step="1"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Next Service</label>
              <input
                type="date"
                value={form.next_service_date || ""}
                onChange={(e) => setForm({ ...form, next_service_date: e.target.value || undefined })}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Vendor</label>
            <input
              type="text"
              value={form.vendor_name || ""}
              onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
              className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
              placeholder="Service provider name"
            />
          </div>
          <div>
            <label className="text-xs font-medium">Notes</label>
            <textarea
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm"
              rows={2}
              placeholder="What was done, parts replaced, etc."
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={loading || !form.service_date}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Record"}
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({
  asset,
  records,
  loading: historyLoading,
  onClose,
}: {
  asset: Asset;
  records: MaintenanceRecord[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold">Maintenance History</h2>
        <p className="mb-4 text-xs text-muted-foreground">{asset.name} ({asset.asset_code})</p>
        {historyLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
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
                    <span>₹{(r.cost_in_paise / 100).toLocaleString("en-IN")}</span>
                  )}
                  {r.vendor_name && <span>{r.vendor_name}</span>}
                  {r.next_service_date && (
                    <span>Next: {new Date(r.next_service_date).toLocaleDateString("en-IN")}</span>
                  )}
                </div>
                {r.notes && (
                  <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
