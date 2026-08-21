import type { Locale } from '@/lib/i18n';
import { getWhatsAppTemplate, providerKey } from './registry';
import type { RenderResult, WhatsAppTemplate } from './types';

/**
 * Turn a business template + named variables into what Twilio needs
 * (positional variables) and what a human can read (preview). This is
 * the single validation gate (plan §18): a required variable that is
 * missing, blank, or a stringified non-value (`undefined`, `null`,
 * `NaN`, `Invalid Date`) refuses the send — a guest never receives
 * "📅 undefined".
 */

/** Fixed prefix for URL buttons — must equal the public origin baked into the approved templates. */
export const BUTTON_BASE = 'https://gharmish.com/';

const NON_VALUES = new Set(['undefined', 'null', 'nan', 'invalid date', '[object object]']);

export function isUsableValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && !NON_VALUES.has(trimmed.toLowerCase());
}

export function compileBody(body: string, template: WhatsAppTemplate): string {
  let out = body;
  template.variables.forEach((v, i) => {
    out = out.split(`{${v.name}}`).join(`{{${i + 1}}}`);
  });
  return out;
}

export function renderWhatsApp(
  id: string,
  locale: Locale,
  vars: Record<string, string | number | null | undefined>,
): RenderResult {
  const template = getWhatsAppTemplate(id);
  if (!template) return { ok: false, error: `unknown whatsapp template ${id}` };
  const content = template.locales[locale];

  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === 'number' && Number.isFinite(v)) clean[k] = String(v);
    else if (isUsableValue(v)) clean[k] = v.trim();
  }

  const missing = template.variables.filter((v) => v.required && !isUsableValue(clean[v.name])).map((v) => v.name);
  if (missing.length > 0) {
    return { ok: false, error: `missing required variables: ${missing.join(', ')}`, missing };
  }

  const variables: Record<string, string> = {};
  let preview = content.body;
  template.variables.forEach((v, i) => {
    const value = clean[v.name] ?? '';
    variables[String(i + 1)] = value;
    preview = preview.split(`{${v.name}}`).join(value);
  });

  const buttons = (content.buttons ?? []).map((b) => ({
    title: b.title,
    url: `${b.urlBase ?? BUTTON_BASE}${clean[b.urlVariable] ?? ''}`,
  }));

  const fallback = template.legacy
    ? { template: template.legacy.key, variables: template.legacy.map(clean, locale) }
    : undefined;

  return {
    ok: true,
    message: { template: providerKey(template.id), variables, fallback, preview, buttons },
  };
}

/** Twilio Content API payload for creating this template/locale (scripts/whatsapp-templates.ts). */
export function providerContentPayload(template: WhatsAppTemplate, locale: Locale, friendlyName: string) {
  const content = template.locales[locale];
  const body = compileBody(content.body, template);
  const variables: Record<string, string> = {};
  template.variables.forEach((v, i) => {
    variables[String(i + 1)] = v.sample[locale];
  });
  const actions = (content.buttons ?? []).map((b) => {
    const idx = template.variables.findIndex((v) => v.name === b.urlVariable) + 1;
    return { type: 'URL', title: b.title, url: `${b.urlBase ?? BUTTON_BASE}{{${idx}}}` };
  });
  return {
    friendly_name: friendlyName,
    language: locale,
    variables,
    types: actions.length
      ? { 'twilio/call-to-action': { body, actions } }
      : { 'twilio/text': { body } },
  };
}
