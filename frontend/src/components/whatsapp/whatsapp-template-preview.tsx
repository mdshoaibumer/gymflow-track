"use client";

import { useMemo } from "react";
import { resolveTemplate, type WhatsAppPlaceholders } from "@/lib/whatsapp";

interface WhatsAppTemplatePreviewProps {
  message: string;
  placeholders: Partial<WhatsAppPlaceholders>;
}

/**
 * Live preview of the WhatsApp message as it will appear in the chat.
 * Styled to resemble a WhatsApp message bubble for instant visual feedback.
 */
export function WhatsAppTemplatePreview({
  message,
  placeholders,
}: WhatsAppTemplatePreviewProps) {
  // Resolve any remaining placeholders in the message for preview
  const resolved = useMemo(
    () => resolveTemplate(message, placeholders),
    [message, placeholders],
  );

  if (!resolved.trim()) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Start typing to see a preview
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Message Preview
      </p>
      <div className="rounded-lg bg-[#dcf8c6] dark:bg-emerald-950/40 p-3 shadow-sm max-w-sm ml-auto">
        <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
          {resolved}
        </p>
        <p className="text-[11px] text-muted-foreground text-right mt-1">
          {new Date().toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
