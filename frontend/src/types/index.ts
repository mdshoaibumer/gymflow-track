export interface ApiError {
  detail: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export type UserRole = "super_admin" | "owner" | "admin" | "staff";

export interface DecodedToken {
  sub: string;
  gym_id: string;
  role: UserRole;
  exp: number;
  type: "access" | "refresh";
}
