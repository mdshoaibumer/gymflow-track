import { request } from "@/lib/api";

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
  list: (params: ListAssetsParams = {}) => {
    const { skip = 0, limit = 50, status, category, search } = params;
    const query = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    if (status) query.set("status", status);
    if (category) query.set("category", category);
    if (search) query.set("search", search);
    return request.get<AssetListResponse>(`/assets?${query}`);
  },

  get: (id: string) =>
    request.get<Asset>(`/assets/${id}`),

  create: (data: CreateAssetPayload) =>
    request.post<Asset>("/assets", data),

  update: (id: string, data: Partial<CreateAssetPayload>) =>
    request.put<Asset>(`/assets/${id}`, data),

  updateStatus: (id: string, status: AssetStatus) =>
    request.put<Asset>(`/assets/${id}/status`, { status }),

  completeMaintenance: (id: string) =>
    request.post<Asset>(`/assets/${id}/complete-maintenance`),

  delete: (id: string) =>
    request.delete<void>(`/assets/${id}`),

  stats: () =>
    request.get<AssetDashboardStats>("/assets/stats"),

  // Maintenance
  recordMaintenance: (assetId: string, data: CreateMaintenancePayload) =>
    request.post<MaintenanceRecord>(`/assets/${assetId}/maintenance`, data),

  getMaintenanceHistory: (assetId: string, skip = 0, limit = 20) =>
    request.get<MaintenanceListResponse>(
      `/assets/${assetId}/maintenance?skip=${skip}&limit=${limit}`
    ),

  getUpcomingMaintenance: (days = 30) =>
    request.get<MaintenanceListResponse>(
      `/assets/maintenance/upcoming?days=${days}`
    ),

  getOverdueMaintenance: () =>
    request.get<MaintenanceListResponse>("/assets/maintenance/overdue"),
};
