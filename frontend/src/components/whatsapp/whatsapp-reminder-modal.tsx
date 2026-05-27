"use client";

import { useCallback, useRef } from "react";
import { MessageSquare, Send, RotateCcw, User, Phone, CalendarCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { WhatsAppPlaceholderHelper } from "./whatsapp-placeholder-helper";
import { WhatsAppTemplatePreview } from "./whatsapp-template-preview";
import type { WhatsAppPlaceholders } from "@/lib/whatsapp";

interface WhatsAppReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  onMessageChange: (message: string) => void;
  onSend: () => void;
  onReset: () => void;
  memberName: string;
  memberPhone: string;
  expiryDate: string;
  planName: string;
  characterCount: number;
  placeholders: Partial<WhatsAppPlaceholders>;
}

/**
 * Premium modal for composing and sending WhatsApp reminders.
 * Features: member info, editable message, live preview, placeholder insertion.
 */
export function WhatsAppReminderModal({
  isOpen,
  onClose,
  message,
  onMessageChange,
  onSend,
  onReset,
  memberName,
  memberPhone,
  expiryDate,
  planName,
  characterCount,
  placeholders,
}: WhatsAppReminderModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInsertPlaceholder = useCallback(
    (placeholder: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        onMessageChange(message + placeholder);
        return;
      }
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newMessage =
        message.slice(0, start) + placeholder + message.slice(end);
      onMessageChange(newMessage);

      // Restore cursor position after insertion
      requestAnimationFrame(() => {
        const newPos = start + placeholder.length;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
      });
    },
    [message, onMessageChange],
  );

  // Auto-resize textarea
  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onMessageChange(e.target.value);
      // Auto-resize
      e.target.style.height = "auto";
      e.target.style.height = `${e.target.scrollHeight}px`;
    },
    [onMessageChange],
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <MessageSquare className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            WhatsApp Reminder
          </DialogTitle>
          <DialogDescription>
            Compose a personalized reminder. The message opens in your WhatsApp
            for manual sending.
          </DialogDescription>
        </DialogHeader>

        {/* Member Info Strip */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-1.5 text-sm">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{memberName}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            {memberPhone}
          </div>
          {expiryDate && (
            <Badge variant="warning" className="text-xs">
              <CalendarCheck className="mr-1 h-3 w-3" />
              Expires {expiryDate}
            </Badge>
          )}
          {planName && (
            <Badge variant="outline" className="text-xs">
              {planName}
            </Badge>
          )}
        </div>

        <Separator />

        {/* Message Editor */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="wa-message" className="text-sm font-medium">
              Message
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {characterCount} characters
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="h-7 text-xs"
                aria-label="Reset message to template"
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Reset
              </Button>
            </div>
          </div>

          <Textarea
            ref={textareaRef}
            id="wa-message"
            value={message}
            onChange={handleTextareaChange}
            className="min-h-[140px] resize-none text-sm leading-relaxed"
            placeholder="Type your reminder message..."
            aria-label="WhatsApp reminder message"
          />

          {/* Placeholder Helper */}
          <WhatsAppPlaceholderHelper
            onInsert={handleInsertPlaceholder}
            values={placeholders}
          />
        </div>

        <Separator />

        {/* Live Preview */}
        <WhatsAppTemplatePreview
          message={message}
          placeholders={placeholders}
        />

        {/* Footer Actions */}
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="sm:mr-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSend}
            disabled={!message.trim()}
            className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
            aria-label="Open WhatsApp with this message"
          >
            <Send className="mr-2 h-4 w-4" />
            Open WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
