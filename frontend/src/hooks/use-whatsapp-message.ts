"use client";

import { useState, useCallback, useMemo } from "react";
import { useGym } from "@/hooks/use-gym";
import { useAuth } from "@/hooks/use-auth";
import {
  resolveTemplate,
  getTemplateForGym,
  openWhatsApp,
  type WhatsAppPlaceholders,
} from "@/lib/whatsapp";
import { toast } from "sonner";

export interface WhatsAppMemberData {
  name: string;
  phone: string;
  membership_end?: string | null;
  membership_plan?: string | null;
  amount_due?: number;
}

export function useWhatsappMessage(member: WhatsAppMemberData) {
  const { data: gym } = useGym();
  const { user } = useAuth();

  const gymId = gym?.id ?? "";
  const defaultTemplate = useMemo(() => getTemplateForGym(gymId), [gymId]);

  const [message, setMessage] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const placeholders = useMemo<Partial<WhatsAppPlaceholders>>(() => ({
    member_name: member.name,
    gym_name: gym?.name ?? "",
    owner_name: user?.name ?? "",
    expiry_date: member.membership_end
      ? new Date(member.membership_end).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "",
    plan_name: member.membership_plan ?? "",
    amount_due: member.amount_due != null
      ? `₹${(member.amount_due / 100).toLocaleString("en-IN")}`
      : "",
    phone_number: member.phone,
  }), [member, gym, user]);

  const resolvedDefault = useMemo(
    () => resolveTemplate(defaultTemplate, placeholders),
    [defaultTemplate, placeholders],
  );

  const open = useCallback(() => {
    setMessage(resolvedDefault);
    setIsOpen(true);
  }, [resolvedDefault]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const send = useCallback(() => {
    if (!member.phone) {
      toast.error("No phone number available for this member");
      return;
    }
    openWhatsApp(member.phone, message);
    toast.success("Opening WhatsApp...", {
      description: "Send the message from your WhatsApp to complete the reminder.",
      duration: 5000,
    });
    setIsOpen(false);
  }, [member.phone, message]);

  const resetMessage = useCallback(() => {
    setMessage(resolvedDefault);
  }, [resolvedDefault]);

  const characterCount = message.length;

  return {
    message,
    setMessage,
    isOpen,
    open,
    close,
    send,
    resetMessage,
    placeholders,
    characterCount,
    memberName: member.name,
    memberPhone: member.phone,
    expiryDate: placeholders.expiry_date ?? "",
    planName: placeholders.plan_name ?? "",
  };
}
