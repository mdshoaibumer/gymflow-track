import { request } from "@/lib/api";

// --- Types ---

export interface WhatsAppConfigResponse {
  id: string;
  gym_id: string;
  api_key_masked: string;
  is_enabled: boolean;
  campaign_prefix: string | null;
  provider_url: string;
}

export interface WhatsAppConfigStatus {
  is_configured: boolean;
  is_enabled: boolean;
  plan_allows_automation: boolean;
  is_active: boolean;
}

export interface WhatsAppTestResponse {
  success: boolean;
  message: string;
  provider_message_id: string | null;
}

export interface WhatsAppConfigPayload {
  api_key: string;
  is_enabled: boolean;
  campaign_prefix?: string | null;
}

// --- API Calls ---

export const whatsappConfigService = {
  getConfig: () =>
    request.get<WhatsAppConfigResponse>("/whatsapp"),

  getStatus: () =>
    request.get<WhatsAppConfigStatus>("/whatsapp/status"),

  saveConfig: (data: WhatsAppConfigPayload) =>
    request.post<WhatsAppConfigResponse>("/whatsapp", data),

  removeConfig: () =>
    request.delete<{ message: string }>("/whatsapp"),

  testConnection: () =>
    request.post<WhatsAppTestResponse>("/whatsapp/test"),

  toggle: () =>
    request.patch<WhatsAppConfigResponse>("/whatsapp/toggle"),
};
