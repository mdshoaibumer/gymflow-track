import { API_URL } from "@/lib/api";
import { toast } from "sonner";

/**
 * Download a CSV file from the backend reports endpoint.
 * Sends cookies for auth (credentials: "include").
 */
export async function downloadCsv(
  endpoint: string,
  filename: string,
  params?: Record<string, string>,
): Promise<void> {
  const url = new URL(`${API_URL}/reports${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  const resp = await fetch(url.toString(), { credentials: "include" });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `Export failed (${resp.status})`);
  }
  const blob = await resp.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  toast.success(`${filename} downloaded`);
}
