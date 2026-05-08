import { apiClient } from "@/lib/api";

export interface Member {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: "male" | "female" | "other" | null;
  membership_status: "active" | "expired" | "frozen";
  membership_plan: string | null;
  membership_start: string | null;
  membership_end: string | null;
  amount_paid: number;
}

export interface MemberListResponse {
  members: Member[];
  total: number;
}

export interface CreateMemberPayload {
  name: string;
  phone: string;
  email?: string;
  gender?: "male" | "female" | "other";
  membership_plan?: string;
  membership_start?: string;
  membership_end?: string;
  amount_paid?: number;
}

export const memberService = {
  list: (token: string, skip = 0, limit = 50) =>
    apiClient<MemberListResponse>(`/members?skip=${skip}&limit=${limit}`, { token }),

  get: (token: string, id: string) =>
    apiClient<Member>(`/members/${id}`, { token }),

  create: (token: string, data: CreateMemberPayload) =>
    apiClient<Member>("/members", { method: "POST", body: data, token }),

  update: (token: string, id: string, data: Partial<CreateMemberPayload>) =>
    apiClient<Member>(`/members/${id}`, { method: "PATCH", body: data, token }),
};
