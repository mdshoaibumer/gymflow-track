import { request } from "@/lib/api";

export interface CustomField {
  id: string;
  label: string;
  field_key: string;
  field_type: "text" | "number" | "date" | "dropdown";
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string | null;
}

export interface CustomFieldListResponse {
  fields: CustomField[];
}

export interface CreateCustomFieldPayload {
  label: string;
  field_type: "text" | "number" | "date" | "dropdown";
  options?: string[];
  is_required?: boolean;
  sort_order?: number;
}

export interface UpdateCustomFieldPayload {
  label?: string;
  field_type?: "text" | "number" | "date" | "dropdown";
  options?: string[];
  is_required?: boolean;
  sort_order?: number;
  is_active?: boolean;
}

export const customFieldService = {
  list: () => request.get<CustomFieldListResponse>("/custom-fields"),

  create: (data: CreateCustomFieldPayload) =>
    request.post<CustomField>("/custom-fields", data),

  update: (id: string, data: UpdateCustomFieldPayload) =>
    request.patch<CustomField>(`/custom-fields/${id}`, data),

  delete: (id: string) => request.delete<void>(`/custom-fields/${id}`),
};
