/** Normalize WhatsApp / phone numbers for storage and lookup. */
export function normalizePhone(phone: string): string {
  let value = phone.trim().replace(/\s+/g, "").replace(/^whatsapp:/i, "");
  // Keep leading +; strip other punctuation
  value = value.replace(/[^\d+]/g, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  return value;
}

export function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  // E.164-ish: + and 8–15 digits
  return /^\+[1-9]\d{7,14}$/.test(normalized);
}

export function formatPhoneDisplay(phone: string): string {
  return normalizePhone(phone);
}
