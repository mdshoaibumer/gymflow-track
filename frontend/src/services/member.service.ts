import { api, request } from "@/lib/api";

export interface Member {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: "male" | "female" | "other" | null;
  father_name: string | null;
  batch: "morning" | "evening" | "afternoon" | null;
  membership_status: "active" | "expired" | "frozen" | "pending" | "cancelled";
  membership_plan: string | null;
  membership_start: string | null;
  membership_end: string | null;
  amount_paid: number;
  photo_url: string | null;
  version: number;
  created_at: string | null;
  updated_at: string | null;
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
  father_name?: string;
  batch?: "morning" | "evening" | "afternoon";
  membership_plan?: string;
  membership_start?: string;
  membership_end?: string;
  amount_paid?: number;
  version?: number;
}

export interface ListMembersParams {
  skip?: number;
  limit?: number;
  search?: string;
}

export const memberService = {
  list: (params: ListMembersParams = {}) => {
    const { skip = 0, limit = 20, search } = params;
    const query = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    if (search) query.set("search", search);
    return request.get<MemberListResponse>(`/members?${query}`);
  },

  get: (id: string) =>
    request.get<Member>(`/members/${id}`),

  create: (data: CreateMemberPayload) =>
    request.post<Member>("/members", data),

  update: (id: string, data: Partial<CreateMemberPayload>) =>
    request.patch<Member>(`/members/${id}`, data),

  replace: (id: string, data: CreateMemberPayload) =>
    request.put<Member>(`/members/${id}`, data),

  delete: (id: string) =>
    request.delete<void>(`/members/${id}`),

  uploadPhoto: (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api
      .post<Member>(`/members/${id}/photo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },

  deletePhoto: (id: string) =>
    request.delete<Member>(`/members/${id}/photo`),
};
