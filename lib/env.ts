import 'server-only';

import { z } from 'zod';
import { hasSupabaseAuth, parseEnv } from '@/lib/env-client';

/**
 * Validated environment variables. Parsed once at module load — a missing
 * or malformed required variable throws immediately at boot rather than
 * failing deep in a request.
 *
 * This module is `server-only` (2026-07-28 audit): today every
 * `serverEnv` field inlines to its `''` default in a browser bundle
 * (Next only inlines `NEXT_PUBLIC_*`), but nothing else stopped a
 * future client module from importing `serverEnv` and shipping the
 * secret-shaped access patterns client-side. Client components import
 * from `lib/env-client.ts`; the client-safe pieces are re-exported here
 * so server code keeps a single import path.
 */

export { clientEnv, hasSupabaseAuth, hasMarketingPixels } from '@/lib/env-client';

const serverSchema = z.object({
  // Optional for now (no DB wired yet — Sprint 1 task 8). Empty string ok.
  DATABASE_URL: z.string().default(''),
  // Optional Sentry DSN — when unset the SDK is a no-op so dev builds
  // stay quiet. Set in Vercel as a Sensitive var when production
  // monitoring is wanted (BRIEF §5).
  SENTRY_DSN: z.string().default(''),
  // Comma-separated E.164 phone numbers (`+9665XXXXXXXX,+9665...`)
  // that get access to `/admin`. Server-only and never exposed to the
  // client. Empty → nobody is admin. Promote to a `user_roles` table
  // when richer admin management is needed.
  ADMIN_PHONES: z.string().default(''),
  // HyperPay / OPPWA (COPYandPAY widget). All optional so the app boots
  // without them — `hasHyperpay()` gates every payment code path and the
  // booking flow stays request-to-book when unset (same boundary pattern
  // as `hasSupabaseAuth()` / `hasDb()`). The access token is a server-only
  // secret (Vercel Sensitive); the entity id is config.
  HYPERPAY_ACCESS_TOKEN: z.string().default(''),
  HYPERPAY_ENTITY_ID: z.string().default(''),
  // `test` → eu-test.oppwa.com + the test-only request flags
  // (testMode=EXTERNAL, customParameters[3DS2_enrolled]). `live` → eu-prod,
  // no test flags. Hard default to `test` so an accidental empty value can
  // never silently send live-server flags. The empty string maps to the
  // default too: Vercel delivers a cleared-but-present env var as '', and
  // a bare enum would fail validation and take down every build/boot
  // (which is exactly what happened on 2026-06-10).
  HYPERPAY_MODE: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['test', 'live']).default('test'),
  ),
  // Optional explicit base URL override; derived from HYPERPAY_MODE when empty.
  HYPERPAY_BASE_URL: z.string().default(''),
  // Separate OPPWA entity for the Apple Pay channel (HyperPay activates
  // Apple Pay on its own entity id, distinct from the card entity).
  // Empty → Apple Pay is not offered and checkout is card-only, exactly
  // as before — same boundary pattern as the other optional services.
  HYPERPAY_APPLEPAY_ENTITY_ID: z.string().default(''),
  // Test-server acquirer routing. `external` (default) sends
  // `testMode=EXTERNAL` + `customParameters[3DS2_enrolled]` so transactions
  // hit HyperPay's real MPGS test terminal; `internal` omits them and uses
  // OPPWA's built-in simulator instead. Workaround switch for 2026-07-12:
  // the external terminal declines MADA/MASTER with 800.100.156 — set
  // `internal` to test those brands until HyperPay fixes their config.
  // Ignored when HYPERPAY_MODE=live. Same empty-string-safe preprocess as
  // HYPERPAY_MODE so a cleared Vercel var can't break boot.
  HYPERPAY_TEST_CONNECTOR: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['external', 'internal']).default('external'),
  ),
  // Shared secret (hex AES-256 key) for decrypting OPPWA webhook
  // notifications — `app/api/webhooks/hyperpay`. Empty → the route answers
  // 503 and settlement relies on the synchronous `/pay/return` check plus
  // the cron reconcile pass. Set it (from the HyperPay dashboard webhook
  // config) before flipping HYPERPAY_MODE=live.
  HYPERPAY_WEBHOOK_SECRET: z.string().default(''),
  // Resend transactional email (booking confirmations / receipts). Optional,
  // same boundary pattern as HyperPay: `hasEmail()` gates every send and the
  // flow is silent (no email) until both arrive — no code change. The API key
  // is a server-only secret; `RESEND_FROM` is the verified sender, e.g.
  // "Gharmish <hello@send.gharmish.com>".
  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM: z.string().default(''),
  // Svix signing secret (`whsec_…`, from the Resend dashboard webhook
  // config) for the delivery-status webhook `app/api/webhooks/resend`.
  // Empty → the route answers 503 and email ledger rows simply stay at
  // `sent` (no delivered/bounce feedback) — exactly the pre-webhook
  // posture, so this is optional and independent of sending itself.
  RESEND_WEBHOOK_SECRET: z.string().default(''),
  // Twilio WhatsApp Business API — transactional booking messages via
  // pre-approved Content templates. All optional, same boundary pattern
  // as `hasEmail()`: `hasWhatsApp()` gates the channel and every send is
  // a silent skip until the three core vars arrive — no code change at
  // go-live. Account SID + auth token are server-only secrets (Vercel
  // Sensitive). `TWILIO_WHATSAPP_FROM` is the WhatsApp-enabled sender in
  // E.164 (`+9665XXXXXXXX`); the `whatsapp:` prefix is added in code.
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_WHATSAPP_FROM: z.string().default(''),
  // JSON map of Meta-approved Content SIDs keyed `<template>.<locale>`,
  // e.g. {"booking_confirmed.ar":"HX…","booking_confirmed.en":"HX…"}.
  // A missing key skips that template's WhatsApp send (email still goes
  // out), so templates can go live one by one as Meta approves them —
  // update the env var, no deploy. See docs/notifications/twilio-setup.md.
  TWILIO_WHATSAPP_CONTENT_SIDS: z.string().default(''),
  // Operational alerts inbox (new applications, disputes, refunds owed,
  // settlement anomalies, cron failures). Optional — `notifyAdmin()` is a
  // silent no-op until it's set, same boundary pattern as `hasEmail()`.
  ADMIN_ALERT_EMAIL: z.string().default(''),
  // Second alert rail (2026-08-02 ops audit P0-7): E.164 phone that
  // receives operational alerts over WhatsApp. Email alerts ride Resend,
  // which is itself one of the things that can fail — a failing alert
  // channel goes dark exactly when it matters. Optional and inert until
  // BOTH this and an approved `admin_alert` Content SID are configured.
  ADMIN_ALERT_WHATSAPP: z.string().default(''),
  // Guest-support WhatsApp number in E.164, published as a `wa.me` deep
  // link on post-booking surfaces (2026-08 ops audit: WhatsApp-first
  // market, support was email-only). Optional — empty falls back to
  // `TWILIO_WHATSAPP_FROM`, the sender guests already hold a thread
  // with; inbound messages there reach the team via the Twilio console
  // (see app/api/webhooks/twilio). Set this to repoint support at a
  // dedicated number without a deploy.
  SUPPORT_WHATSAPP: z.string().default(''),
  // Claude API key for the WhatsApp support agent (WHATSAPP_SUPPORT_PLAN.md
  // phase 2). Optional: while empty, new conversations route to the human
  // inbox exactly as in phase 1 — setting the key is the agent's go-live.
  ANTHROPIC_API_KEY: z.string().default(''),
  // Model override for the support agent; default is the quality tier.
  SUPPORT_AGENT_MODEL: z.string().default('claude-opus-4-8'),
  // Shared secret for the scheduled release-holds job. Vercel Cron sends it as
  // `Authorization: Bearer <CRON_SECRET>`. Empty → the route rejects every
  // request (the job is inert until configured).
  CRON_SECRET: z.string().default(''),
  // TikTok Events API access token (server-to-server CompletePayment at
  // settlement — lib/analytics/server-events.ts). Pairs with the existing
  // NEXT_PUBLIC_TIKTOK_PIXEL_ID as the event_source_id. Optional, same
  // inert-until-configured boundary as the other integrations: empty →
  // no server event fires and conversions ride the client pixel alone.
  TIKTOK_EVENTS_ACCESS_TOKEN: z.string().default(''),
  // GA4 Measurement Protocol API secret (Admin → Data streams → Measure-
  // ment Protocol API secrets) for server-side `refund` events. Pairs
  // with NEXT_PUBLIC_GA_MEASUREMENT_ID. Optional — empty → refunds are
  // simply not reported to GA4.
  GA4_API_SECRET: z.string().default(''),
  // AES-256-GCM key (base64, 32 bytes) for at-rest encryption of host
  // identity PII (IBANs, national IDs, CR numbers) — see lib/pii-crypto.ts.
  // Empty → encryption is a pass-through no-op (same inert-until-configured
  // boundary as the other integrations). Generate with
  // `openssl rand -base64 32`; set in Vercel as Sensitive.
  PII_ENCRYPTION_KEY: z.string().default(''),
  // Supabase service-role key — SERVER ONLY, bypasses RLS. Used exclusively
  // for storage writes inside ownership-checked server actions (the same
  // trust model as the BYPASSRLS `gharmish_app` DB role): user-session
  // tokens were rejected by storage RLS in production, so the action layer
  // is the gatekeeper and storage is plumbing. Never expose to the client.
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  // Optional HMAC secret for the signed last-booking cookie. Unset is
  // fine: the key derives from SUPABASE_SERVICE_ROLE_KEY (always present
  // in production). Set this only to decouple cookie-signing rotation
  // from the service key — rotating either invalidates outstanding
  // cookies, which costs anonymous guests nothing worse than signing in.
  COOKIE_SIGNING_SECRET: z.string().default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const serverEnv = parseEnv(
  serverSchema,
  {
    DATABASE_URL: process.env.DATABASE_URL,
    SENTRY_DSN: process.env.SENTRY_DSN,
    ADMIN_PHONES: process.env.ADMIN_PHONES,
    HYPERPAY_ACCESS_TOKEN: process.env.HYPERPAY_ACCESS_TOKEN,
    HYPERPAY_ENTITY_ID: process.env.HYPERPAY_ENTITY_ID,
    HYPERPAY_APPLEPAY_ENTITY_ID: process.env.HYPERPAY_APPLEPAY_ENTITY_ID,
    HYPERPAY_MODE: process.env.HYPERPAY_MODE,
    HYPERPAY_BASE_URL: process.env.HYPERPAY_BASE_URL,
    HYPERPAY_TEST_CONNECTOR: process.env.HYPERPAY_TEST_CONNECTOR,
    HYPERPAY_WEBHOOK_SECRET: process.env.HYPERPAY_WEBHOOK_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
    TWILIO_WHATSAPP_CONTENT_SIDS: process.env.TWILIO_WHATSAPP_CONTENT_SIDS,
    ADMIN_ALERT_EMAIL: process.env.ADMIN_ALERT_EMAIL,
    ADMIN_ALERT_WHATSAPP: process.env.ADMIN_ALERT_WHATSAPP,
    SUPPORT_WHATSAPP: process.env.SUPPORT_WHATSAPP,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    SUPPORT_AGENT_MODEL: process.env.SUPPORT_AGENT_MODEL,
    CRON_SECRET: process.env.CRON_SECRET,
    TIKTOK_EVENTS_ACCESS_TOKEN: process.env.TIKTOK_EVENTS_ACCESS_TOKEN,
    GA4_API_SECRET: process.env.GA4_API_SECRET,
    PII_ENCRYPTION_KEY: process.env.PII_ENCRYPTION_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    COOKIE_SIGNING_SECRET: process.env.COOKIE_SIGNING_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  },
  'server',
);

/**
 * May the dev-only stub auth (cookie session + `STUB_OTP`) activate?
 *
 * The stub is the fallback when Supabase isn't configured — convenient in
 * dev, dangerous in prod: if the Supabase vars were ever missing in a
 * production deploy, the app would otherwise silently accept `000000` as a
 * valid OTP for any phone/email. So we fail **closed** — the stub is allowed
 * only outside production. In production with Supabase unset, auth simply
 * doesn't work (no session, OTP refused) rather than minting fake sessions.
 */
export function stubAuthAllowed(): boolean {
  return !hasSupabaseAuth() && serverEnv.NODE_ENV !== 'production';
}

/**
 * Is HyperPay configured for online card/Mada payment? Same boundary as
 * `hasSupabaseAuth()`: every payment code path checks this first, and the
 * booking flow stays request-to-book (no card charged) when false. Flips
 * the moment the access token + entity id arrive in the environment — no
 * code change. The mode (`test`/`live`) is independent and always set.
 */
export function hasHyperpay(): boolean {
  return Boolean(serverEnv.HYPERPAY_ACCESS_TOKEN && serverEnv.HYPERPAY_ENTITY_ID);
}

/**
 * Is the dedicated Apple Pay entity configured (on top of the card
 * entity)? Gates the Apple Pay option in checkout: unset → the payment
 * step is card-only and no Apple Pay checkout can be prepared.
 */
export function hasHyperpayApplePay(): boolean {
  return hasHyperpay() && Boolean(serverEnv.HYPERPAY_APPLEPAY_ENTITY_ID);
}

/**
 * Is transactional email (Resend) configured? Same boundary as
 * `hasHyperpay()`: every email send checks this first and is a silent no-op
 * when false, so the booking flow works without it. Flips the moment the API
 * key + verified sender arrive — no code change.
 */
export function hasEmail(): boolean {
  return Boolean(serverEnv.RESEND_API_KEY && serverEnv.RESEND_FROM);
}

/**
 * Is the Twilio WhatsApp channel configured? Same boundary as
 * `hasEmail()`: the notification dispatcher checks this per send and
 * skips the WhatsApp channel silently when false, so every flow works
 * email-only until the Twilio account + WhatsApp sender arrive — no
 * code change at go-live. Per-template availability is gated separately
 * by `TWILIO_WHATSAPP_CONTENT_SIDS` (Meta approves templates one by one).
 */
export function hasWhatsApp(): boolean {
  return Boolean(
    serverEnv.TWILIO_ACCOUNT_SID && serverEnv.TWILIO_AUTH_TOKEN && serverEnv.TWILIO_WHATSAPP_FROM,
  );
}

/** The Claude-powered support agent answers new WhatsApp conversations. */
export function hasSupportAgent(): boolean {
  return hasWhatsApp() && Boolean(serverEnv.ANTHROPIC_API_KEY);
}

/**
 * Guest-support WhatsApp number (E.164) for public `wa.me` links, or
 * null when neither var is set. Distinct from `hasWhatsApp()`: that
 * gates the platform sending out; this is about guests writing in.
 * `SUPPORT_WHATSAPP` wins so support can move to a dedicated number
 * without a deploy; the Twilio sender is the zero-config fallback.
 */
export function supportWhatsappE164(): string | null {
  return serverEnv.SUPPORT_WHATSAPP || serverEnv.TWILIO_WHATSAPP_FROM || null;
}
