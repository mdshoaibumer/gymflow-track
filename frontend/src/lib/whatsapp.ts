/**
 * @file whatsapp.ts
 * @description WhatsApp URL generation, phone sanitization, and template
 *              resolution utilities. Uses wa.me deep links (zero API cost).
 * @author Mohammed Shoaib U
 * @module lib/whatsapp
 */

/**
 * WhatsApp URL generation and phone number sanitization utilities.
 *
 * Uses the wa.me deep link — zero API cost, zero Meta approval.
 * The gym owner sends the message manually from their own device.
 */

// ── Phone number helpers ──────────────────────────────────────────

/**
 * Sanitize and normalize a phone number for WhatsApp's wa.me format.
 * Supports Indian phone formats: +91, 091, 0-prefixed, raw 10-digit.
 * Returns digits-only string with country code (e.g. "919876543210").
 */
export function sanitizePhoneForWhatsApp(raw: string): string {
  // Strip everything except digits
  let digits = raw.replace(/\D/g, "");

  // 10-digit Indian mobile → prepend 91
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    digits = `91${digits}`;
  }

  // 11-digit with leading 0 (e.g. 09876543210) → drop 0, prepend 91
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = `91${digits.slice(1)}`;
  }

  // 13-digit with leading 0091 → drop 00
  if (digits.length === 14 && digits.startsWith("0091")) {
    digits = digits.slice(2);
  }

  return digits;
}

// ── Template system ───────────────────────────────────────────────

export interface WhatsAppPlaceholders {
  member_name: string;
  gym_name: string;
  owner_name: string;
  expiry_date: string;
  plan_name: string;
  amount_due: string;
  phone_number: string;
}

export const PLACEHOLDER_KEYS: (keyof WhatsAppPlaceholders)[] = [
  "member_name",
  "gym_name",
  "owner_name",
  "expiry_date",
  "plan_name",
  "amount_due",
  "phone_number",
];

export const PLACEHOLDER_LABELS: Record<keyof WhatsAppPlaceholders, string> = {
  member_name: "Member Name",
  gym_name: "Gym Name",
  owner_name: "Owner Name",
  expiry_date: "Expiry Date",
  plan_name: "Plan Name",
  amount_due: "Amount Due",
  phone_number: "Phone Number",
};

export const DEFAULT_WHATSAPP_TEMPLATE = `Hi {{member_name}},

Your membership at {{gym_name}} expires on {{expiry_date}}.

Please renew your membership to continue uninterrupted access.

Thank you,
{{owner_name}}
{{gym_name}}`;

/**
 * Replace all {{placeholder}} tokens in a template with actual values.
 * Missing values are replaced with an empty string to avoid broken messages.
 */
export function resolveTemplate(
  template: string,
  values: Partial<WhatsAppPlaceholders>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (match, key: string) => {
      const value = values[key as keyof WhatsAppPlaceholders];
      return value ?? "";
    },
  );
}

// ── URL generation ────────────────────────────────────────────────

/**
 * Build a wa.me URL with a prefilled message.
 * Opens WhatsApp (Web or native) with the message ready to send.
 */
export function buildWhatsAppUrl(phone: string, message: string): string {
  const sanitized = sanitizePhoneForWhatsApp(phone);
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${sanitized}?text=${encoded}`;
}

/**
 * Open WhatsApp in a new tab with the prefilled message.
 */
export function openWhatsApp(phone: string, message: string): void {
  const url = buildWhatsAppUrl(phone, message);
  window.open(url, "_blank", "noopener,noreferrer");
}

// ── Template persistence (localStorage per gym) ───────────────────

const STORAGE_KEY_PREFIX = "gymflow_wa_template_";

export function getSavedTemplate(gymId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`${STORAGE_KEY_PREFIX}${gymId}`);
}

export function saveTemplate(gymId: string, template: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${gymId}`, template);
}

export function getTemplateForGym(gymId: string): string {
  return getSavedTemplate(gymId) || DEFAULT_WHATSAPP_TEMPLATE;
}
