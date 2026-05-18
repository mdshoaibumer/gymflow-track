import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { whatsappConfigService } from "@/services/whatsapp-config.service";
import type {
  WhatsAppConfigPayload,
  WhatsAppConfigResponse,
  WhatsAppConfigStatus,
} from "@/services/whatsapp-config.service";
import { toast } from "sonner";

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
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || "Failed to save configuration";
      toast.error(msg);
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
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || "Failed to toggle";
      toast.error(msg);
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
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || "Test message failed";
      toast.error(msg);
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
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || "Failed to remove configuration";
      toast.error(msg);
    },
  });
}
