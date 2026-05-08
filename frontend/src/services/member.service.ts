import { apiClient } from "@/lib/api";

export interface Member {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: "male" | "female" | "other" | null;
  membership_status: "active" | "expired" | "frozen" | "pending" | "cancelled";
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

export interface ListMembersParams {
  skip?: number;
  limit?: number;
  search?: string;
}

export const memberService = {
  list: (token: string, params: ListMembersParams = {}) => {
    const { skip = 0, limit = 20, search } = params;
    const query = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    if (search) query.set("search", search);
    return apiClient<MemberListResponse>(`/members?${query}`, { token });
  },

  get: (token: string, id: string) =>
    apiClient<Member>(`/members/${id}`, { token }),

  create: (token: string, data: CreateMemberPayload) =>
    apiClient<Member>("/members", { method: "POST", body: data, token }),

  update: (token: string, id: string, data: Partial<CreateMemberPayload>) =>
    apiClient<Member>(`/members/${id}`, { method: "PATCH", body: data, token }),

  replace: (token: string, id: string, data: CreateMemberPayload) =>
    apiClient<Member>(`/members/${id}`, { method: "PUT", body: data, token }),

  delete: (token: string, id: string) =>
    apiClient<void>(`/members/${id}`, { method: "DELETE", token }),
};
