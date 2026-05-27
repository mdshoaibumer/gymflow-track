/**
 * @file whatsapp-reminder-button.tsx
 * @description Self-contained WhatsApp reminder button with modal.
 *              Supports compact mode for table rows (icon-only on small screens).
 * @author Mohammed Shoaib U
 * @module components/whatsapp/whatsapp-reminder-button
 */

"use client";

import { MessageSquare } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { WhatsAppReminderModal } from "./whatsapp-reminder-modal";
import {
  useWhatsappMessage,
  type WhatsAppMemberData,
} from "@/hooks/use-whatsapp-message";
import { cn } from "@/lib/utils";

interface WhatsAppReminderButtonProps
  extends Omit<ButtonProps, "onClick"> {
  member: WhatsAppMemberData;
  /** Compact mode for table rows — icon only on small screens */
  compact?: boolean;
}

/**
 * Self-contained WhatsApp Reminder button + modal.
 * Drop into any table row, card, or profile page.
 *
 * - Click opens the reminder modal
 * - Modal handles message editing, preview, and wa.me URL launch
 * - Zero infrastructure — uses wa.me deep links
 */
export function WhatsAppReminderButton({
  member,
  compact = false,
  className,
  ...buttonProps
}: WhatsAppReminderButtonProps) {
  const wa = useWhatsappMessage(member);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        onClick={wa.open}
        className={cn(
          "border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30 dark:hover:text-green-300",
          compact && "h-8 px-2.5",
          className,
        )}
        title="Send WhatsApp reminder"
        aria-label={`Send WhatsApp reminder to ${member.name}`}
        {...buttonProps}
      >
        <MessageSquare className={cn("h-4 w-4", !compact && "mr-2")} />
        {!compact && <span className="hidden sm:inline">WhatsApp</span>}
      </Button>

      <WhatsAppReminderModal
        isOpen={wa.isOpen}
        onClose={wa.close}
        message={wa.message}
        onMessageChange={wa.setMessage}
        onSend={wa.send}
        onReset={wa.resetMessage}
        memberName={wa.memberName}
        memberPhone={wa.memberPhone}
        expiryDate={wa.expiryDate}
        planName={wa.planName}
        characterCount={wa.characterCount}
        placeholders={wa.placeholders}
      />
    </>
  );
}
