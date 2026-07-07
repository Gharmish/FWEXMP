/**
 * WhatsApp deep links (https://faq.whatsapp.com/5913398998672934).
 * The lean launch channel per BRIEF §5 — the full Business API via
 * 360dialog comes later; `wa.me` links cost nothing and work today.
 *
 * `wa.me` wants the number digits-only (no `+`, spaces, or zeros
 * prefix); we accept canonical E.164 and strip the `+`.
 */
/**
 * Recipient-less share link — opens WhatsApp's chat picker with the text
 * prefilled (e.g. sharing an invoice link with yourself or your group).
 */
export function whatsappShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function whatsappLink(phoneE164: string, text?: string): string | null {
  const digits = phoneE164.replace(/[^\d]/g, '');
  // E.164 is 8–15 digits; anything else isn't a dialable number.
  if (digits.length < 8 || digits.length > 15) return null;
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
