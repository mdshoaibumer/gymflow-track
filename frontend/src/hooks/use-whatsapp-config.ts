import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { whatsappConfigService } from "@/services/whatsapp-config.service";
import type {
  WhatsAppConfigPayload,
  WhatsAppConfigResponse,
  WhatsAppConfigStatus,
} from "@/services/whatsapp-config.service";
import { toast } from "sonner";

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response;
    if (resp?.data?.detail) return resp.data.detail;
  }
  return fallback;
}

const KEYS = {
  config: ["whatsapp-config"] as const,
  status: ["whatsapp-status"] as const,
};

export function useWhatsAppStatus() {
  return useQuery<WhatsAppConfigStatus>({
    queryKey: KEYS.status,
    queryFn: whatsappConfigService.getStatus,
    retry: false,
  });
}

export function useWhatsAppConfig() {
  return useQuery<WhatsAppConfigResponse>({
    queryKey: KEYS.config,
    queryFn: whatsappConfigService.getConfig,
    retry: false,
  });
}

export function useSaveWhatsAppConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WhatsAppConfigPayload) =>
      whatsappConfigService.saveConfig(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.config });
      qc.invalidateQueries({ queryKey: KEYS.status });
      toast.success("WhatsApp configuration saved");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to save configuration"));
    },
  });
}

export function useToggleWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: whatsappConfigService.toggle,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEYS.config });
      qc.invalidateQueries({ queryKey: KEYS.status });
      toast.success(
        data.is_enabled ? "WhatsApp automation enabled" : "WhatsApp automation disabled"
      );
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to toggle"));
    },
  });
}

export function useTestWhatsApp() {
  return useMutation({
    mutationFn: whatsappConfigService.testConnection,
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Test message failed"));
    },
  });
}

export function useRemoveWhatsAppConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: whatsappConfigService.removeConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.config });
      qc.invalidateQueries({ queryKey: KEYS.status });
      toast.success("WhatsApp configuration removed");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to remove configuration"));
    },
  });
}
