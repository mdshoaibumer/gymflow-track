import { apiClient } from "@/lib/api";

export interface AttendanceRecord {
  id: string;
  gym_id: string;
  member_id: string;
  check_in_at: string;
  check_out_at: string | null;
  check_in_date: string;
  status: "checked_in" | "checked_out" | "cancelled";
  source: "qr" | "manual";
  recorded_by: string | null;
  member_name: string | null;
  member_phone: string | null;
}

export interface AttendanceListResponse {
  attendance: AttendanceRecord[];
  total: number;
}

export interface AttendanceStats {
  checked_in_today: number;
  currently_in_gym: number;
  total_this_week: number;
}

export interface QRTokenResponse {
  qr_token: string;
  member_id: string;
  member_name: string;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface AttendanceTrendResponse {
  trend: DailyCount[];
}

export interface ListAttendanceParams {
  skip?: number;
  limit?: number;
  start_date?: string;
  end_date?: string;
}

export const attendanceService = {
  checkInByQR: (token: string, qr_token: string) =>
    apiClient<AttendanceRecord>("/attendance/check-in", {
      method: "POST",
      body: { qr_token },
      token,
    }),

  checkInManual: (token: string, member_id: string) =>
    apiClient<AttendanceRecord>("/attendance/check-in/manual", {
      method: "POST",
      body: { member_id },
      token,
    }),

  checkOut: (token: string, attendance_id: string) =>
    apiClient<AttendanceRecord>(`/attendance/${attendance_id}/check-out`, {
      method: "POST",
      token,
    }),

  cancel: (token: string, attendance_id: string) =>
    apiClient<AttendanceRecord>(`/attendance/${attendance_id}/cancel`, {
      method: "POST",
      token,
    }),

  getToday: (token: string, skip = 0, limit = 100) =>
    apiClient<AttendanceListResponse>(
      `/attendance/today?skip=${skip}&limit=${limit}`,
      { token }
    ),

  getStats: (token: string) =>
    apiClient<AttendanceStats>("/attendance/stats", { token }),

  getTrend: (token: string, days = 14) =>
    apiClient<AttendanceTrendResponse>(`/attendance/trend?days=${days}`, {
      token,
    }),

  getHistory: (token: string, params: ListAttendanceParams = {}) => {
    const { skip = 0, limit = 50, start_date, end_date } = params;
    const query = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    if (start_date) query.set("start_date", start_date);
    if (end_date) query.set("end_date", end_date);
    return apiClient<AttendanceListResponse>(`/attendance/history?${query}`, {
      token,
    });
  },

  getMemberAttendance: (token: string, member_id: string, skip = 0, limit = 30) =>
    apiClient<AttendanceListResponse>(
      `/attendance/member/${member_id}?skip=${skip}&limit=${limit}`,
      { token }
    ),

  getMemberQR: (token: string, member_id: string) =>
    apiClient<QRTokenResponse>(`/attendance/member/${member_id}/qr`, { token }),
};
