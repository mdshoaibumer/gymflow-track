"use client";

import { PLACEHOLDER_KEYS, PLACEHOLDER_LABELS, type WhatsAppPlaceholders } from "@/lib/whatsapp";
import { Badge } from "@/components/ui/badge";

interface WhatsAppPlaceholderHelperProps {
  onInsert: (placeholder: string) => void;
  values: Partial<WhatsAppPlaceholders>;
}

/**
 * Clickable placeholder badges that insert tokens into the message editor.
 * Shows the resolved value on hover so the owner knows what gets inserted.
 */
export function WhatsAppPlaceholderHelper({
  onInsert,
  values,
}: WhatsAppPlaceholderHelperProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Click to insert placeholder:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PLACEHOLDER_KEYS.map((key) => {
          const resolved = values[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onInsert(`{{${key}}}`)}
              className="group relative"
              title={resolved ? `Value: ${resolved}` : "No value available"}
              aria-label={`Insert ${PLACEHOLDER_LABELS[key]} placeholder`}
            >
              <Badge
                variant="secondary"
                className="cursor-pointer text-xs transition-colors hover:bg-primary/10 hover:text-primary"
              >
                {PLACEHOLDER_LABELS[key]}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
