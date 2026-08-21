import type { Locale } from '@/lib/i18n';

/**
 * One source of truth for WhatsApp communication (2026-08-21 WhatsApp
 * CX redesign). A template here is the BUSINESS definition — id, event,
 * audience, both locales, variables, CTA. The provider side (Twilio
 * Content SID per id+locale) stays in the `TWILIO_WHATSAPP_CONTENT_SIDS`
 * env map, so a Meta re-approval never needs a code change.
 *
 * Bodies are written with NAMED placeholders (`{experienceName}`) and
 * compiled to Twilio's positional `{{1}}…{{n}}` in declaration order of
 * `variables` — the order is part of the approved template, so never
 * reorder a shipped template's variables; append instead.
 */

export type WhatsAppAudience = 'guest' | 'host' | 'admin' | 'support';

/** Meta template category — drives pricing and the approval rules. */
export type WhatsAppCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

export type WhatsAppVariableKind =
  /** Plain text. Rendered into the body. */
  | 'text'
  /**
   * Path appended to `https://gharmish.com/` on the URL button. Never
   * rendered into the body — WhatsApp renders the button; the guest
   * never sees a raw URL inside Arabic prose.
   */
  | 'url-suffix';

export interface WhatsAppVariableSpec {
  /** Name used in bodies as `{name}` and in the vars object. */
  name: string;
  kind: WhatsAppVariableKind;
  /** Missing/blank required → the send is refused (ledgered `failed`). */
  required: boolean;
  /** Sample for Meta review (realistic, same shape as production). */
  sample: Record<Locale, string>;
  description?: string;
}

export interface WhatsAppButton {
  type: 'URL';
  /** ≤ 20 characters (WhatsApp limit). */
  title: string;
  /** Name of the `url-suffix` variable this button uses. */
  urlVariable: string;
  /** Fixed prefix the suffix is appended to. Default `https://gharmish.com/`. */
  urlBase?: string;
}

export interface WhatsAppLocaleContent {
  /** Multi-line body with `{name}` placeholders. ≤ 1024 chars. */
  body: string;
  buttons?: readonly WhatsAppButton[];
}

/** The legacy (v1/v2) approved Content template a new id falls back to. */
export interface WhatsAppLegacyFallback {
  /** Legacy SID-map key, e.g. `host_new_booking`. */
  key: string;
  /** Maps the new named vars onto the legacy positional slots. */
  map: (vars: Record<string, string>, locale: Locale) => Record<string, string>;
}

export interface WhatsAppTemplate {
  /** Business id + SID-map key, e.g. `host_booking_confirmed`. */
  id: string;
  audience: WhatsAppAudience;
  /** Domain event, e.g. `BOOKING_CONFIRMED`. */
  event: string;
  category: WhatsAppCategory;
  /** One-line operator description (what / when). */
  description: string;
  variables: readonly WhatsAppVariableSpec[];
  locales: Record<Locale, WhatsAppLocaleContent>;
  /**
   * Until Meta approves the new template, route through the legacy one
   * so delivery never regresses (plan §21). Removed once the new SID is
   * live everywhere.
   */
  legacy?: WhatsAppLegacyFallback;
}

export interface RenderedWhatsApp {
  /** SID-map key to resolve (`v3/<id>`). */
  template: string;
  /** Positional variables for Twilio, `{"1": "…"}`. */
  variables: Record<string, string>;
  /** Legacy SID-map key + positional variables, when the template has one. */
  fallback?: { template: string; variables: Record<string, string> };
  /** What the recipient will read — body with values filled in. */
  preview: string;
  /** Button titles + resolved absolute URLs, for previews and logs. */
  buttons: Array<{ title: string; url: string }>;
}

export type RenderResult =
  | { ok: true; message: RenderedWhatsApp }
  | { ok: false; error: string; missing?: string[] };
