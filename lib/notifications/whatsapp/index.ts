import type { Locale } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import type { WhatsAppPayload } from '../types';
import { renderWhatsApp } from './render';

export * from './format';
export * from './links';
export { renderWhatsApp } from './render';
export { WHATSAPP_TEMPLATES, getWhatsAppTemplate } from './registry';
export { REFUND_LINES, type RefundLineKind } from './templates/guest';
export { SUPPORT_SESSION_COPY } from './templates/internal';

/**
 * Build the dispatcher's WhatsApp payload from a registry template.
 * Validation failures are reported (template id + context, never the
 * phone) and returned as an `invalid` payload so the ledger records
 * WHY the guest got no WhatsApp — the email leg still goes out.
 */
export function whatsappPayload(
  id: string,
  locale: Locale,
  vars: Record<string, string | number | null | undefined>,
  context: Record<string, string | number | null | undefined> = {},
): WhatsAppPayload {
  const rendered = renderWhatsApp(id, locale, vars);
  if (!rendered.ok) {
    reportError(new Error(`whatsapp template ${id}: ${rendered.error}`), {
      surface: 'whatsapp:render',
      template: id,
      locale,
      ...context,
    });
    return { template: id, variables: {}, invalid: rendered.error };
  }
  return {
    template: rendered.message.template,
    variables: rendered.message.variables,
    fallback: rendered.message.fallback,
  };
}
