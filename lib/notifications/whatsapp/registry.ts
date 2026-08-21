import type { WhatsAppTemplate } from './types';
import { GUEST_TEMPLATES } from './templates/guest';
import { HOST_TEMPLATES } from './templates/host';
import { INTERNAL_TEMPLATES } from './templates/internal';

/** Every WhatsApp template Gharmish sends, by business id. */
export const WHATSAPP_TEMPLATES: readonly WhatsAppTemplate[] = [
  ...GUEST_TEMPLATES,
  ...HOST_TEMPLATES,
  ...INTERNAL_TEMPLATES,
];

const byId = new Map(WHATSAPP_TEMPLATES.map((t) => [t.id, t]));

export type WhatsAppTemplateId = (typeof WHATSAPP_TEMPLATES)[number]['id'];

export function getWhatsAppTemplate(id: string): WhatsAppTemplate | undefined {
  return byId.get(id);
}

/**
 * SID-map key for a registry template: `v3/<id>` (+ `.<locale>` in the
 * env map). Namespaced so a v3 id can never collide with a legacy key of
 * the same name and pick up the old body with the new variables.
 */
export function providerKey(id: string): string {
  return `v3/${id}`;
}

/** Friendly name used on the Twilio account: `gharmish_<id>_v3_<locale>`. */
export function providerFriendlyName(id: string, locale: 'ar' | 'en'): string {
  return `gharmish_${id}_v3_${locale}`;
}
