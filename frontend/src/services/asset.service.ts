import { apiClient } from "@/lib/api";

export type AssetStatus = "active" | "under_maintenance" | "out_of_service" | "retired";
export type AssetCategory =
  | "cardio"
  | "strength"
  | "free_weights"
  | "functional"
  | "accessories"
  | "facility"
  | "other";
export type MaintenanceType = "preventive" | "corrective" | "inspection" | "warranty";

export interface Asset {
  id: string;
  gym_id: string;
  name: string;
  asset_code: string;
  category: AssetCategory;
  manufacturer: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_cost_in_paise: number | null;
  warranty_expiry: string | null;
  notes: string | null;
  status: AssetStatus;
}

export interface AssetListResponse {
  assets: Asset[];
  total: number;
}

export interface MaintenanceRecord {
  id: string;
  gym_id: string;
  asset_id: string;
  maintenance_type: MaintenanceType;
  service_date: string;
  next_service_date: string | null;
  cost_in_paise: number;
  vendor_name: string | null;
  notes: string | null;
  performed_by: string | null;
}

export interface MaintenanceListResponse {
  records: MaintenanceRecord[];
  total: number;
}

export interface AssetDashboardStats {
  active_count: number;
  under_maintenance_count: number;
  out_of_service_count: number;
  retired_count: number;
  total_count: number;
  upcoming_maintenance: number;
  overdue_maintenance: number;
  maintenance_cost_this_month_paise: number;
}

export interface CreateAssetPayload {
  name: string;
  asset_code: string;
  category: AssetCategory;
  manufacturer?: string;
  serial_number?: string;
  purchase_date?: string;
  purchase_cost_in_paise?: number;
  warranty_expiry?: string;
  notes?: string;
}

export interface CreateMaintenancePayload {
  maintenance_type: MaintenanceType;
  service_date: string;
  next_service_date?: string;
  cost_in_paise?: number;
  vendor_name?: string;
  notes?: string;
}

export interface ListAssetsParams {
  skip?: number;
  limit?: number;
  status?: AssetStatus;
  category?: AssetCategory;
  search?: string;
}

export const assetService = {
  list: (token: string, params: ListAssetsParams = {}) => {
    const { skip = 0, limit = 50, status, category, search } = params;
    const query = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    if (status) query.set("status", status);
    if (category) query.set("category", category);
    if (search) query.set("search", search);
    return apiClient<AssetListResponse>(`/assets?${query}`, { token });
  },

  get: (token: string, id: string) =>
    apiClient<Asset>(`/assets/${id}`, { token }),

  create: (token: string, data: CreateAssetPayload) =>
    apiClient<Asset>("/assets", { method: "POST", body: data, token }),

  update: (token: string, id: string, data: Partial<CreateAssetPayload>) =>
    apiClient<Asset>(`/assets/${id}`, { method: "PUT", body: data, token }),

  updateStatus: (token: string, id: string, status: AssetStatus) =>
    apiClient<Asset>(`/assets/${id}/status`, {
      method: "PUT",
      body: { status },
      token,
    }),

  completeMaintenance: (token: string, id: string) =>
    apiClient<Asset>(`/assets/${id}/complete-maintenance`, {
      method: "POST",
      token,
    }),

  delete: (token: string, id: string) =>
    apiClient<void>(`/assets/${id}`, { method: "DELETE", token }),

  stats: (token: string) =>
    apiClient<AssetDashboardStats>("/assets/stats", { token }),

  // Maintenance
  recordMaintenance: (token: string, assetId: string, data: CreateMaintenancePayload) =>
    apiClient<MaintenanceRecord>(`/assets/${assetId}/maintenance`, {
      method: "POST",
      body: data,
      token,
    }),

  getMaintenanceHistory: (token: string, assetId: string, skip = 0, limit = 20) =>
    apiClient<MaintenanceListResponse>(
      `/assets/${assetId}/maintenance?skip=${skip}&limit=${limit}`,
      { token }
    ),

  getUpcomingMaintenance: (token: string, days = 30) =>
    apiClient<MaintenanceListResponse>(
      `/assets/maintenance/upcoming?days=${days}`,
      { token }
    ),

  getOverdueMaintenance: (token: string) =>
    apiClient<MaintenanceListResponse>("/assets/maintenance/overdue", { token }),
};
