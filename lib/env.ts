import { z } from 'zod';

/**
 * Validated environment variables. Parsed once at module load — a missing
 * or malformed required variable throws immediately at boot rather than
 * failing deep in a request.
 *
 * Keep server-only secrets in `serverEnv` and never import it from a
 * client component. `clientEnv` holds only `NEXT_PUBLIC_*` values.
 */

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
  // Operational alerts inbox (new applications, disputes, refunds owed,
  // settlement anomalies, cron failures). Optional — `notifyAdmin()` is a
  // silent no-op until it's set, same boundary pattern as `hasEmail()`.
  ADMIN_ALERT_EMAIL: z.string().default(''),
  // Shared secret for the scheduled release-holds job. Vercel Cron sends it as
  // `Authorization: Bearer <CRON_SECRET>`. Empty → the route rejects every
  // request (the job is inert until configured).
  CRON_SECRET: z.string().default(''),
  // Supabase service-role key — SERVER ONLY, bypasses RLS. Used exclusively
  // for storage writes inside ownership-checked server actions (the same
  // trust model as the BYPASSRLS `gharmish_app` DB role): user-session
  // tokens were rejected by storage RLS in production, so the action layer
  // is the gatekeeper and storage is plumbing. Never expose to the client.
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.string().default(''),
  // Supabase Auth — BRIEF §5 ("Supabase Auth for guest and host accounts,
  // email + phone OTP"). Both must be set for real auth; if either is
  // empty the auth layer falls back to a dev-mode cookie stub so the
  // UX stays demoable creds-free. Same boundary pattern as `hasDb()`.
  NEXT_PUBLIC_SUPABASE_URL: z.string().default(''),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default(''),
  // Snap Pixel + TikTok Pixel ids for ad conversion tracking. Optional —
  // `hasMarketingPixels()` gates both the script loader and the cookie
  // banner's consent mode, so until at least one id is set the site sets
  // zero marketing cookies and the banner stays a plain notice. Even when
  // set, the pixels load only after the visitor picks "Accept all".
  NEXT_PUBLIC_SNAP_PIXEL_ID: z.string().default(''),
  NEXT_PUBLIC_TIKTOK_PIXEL_ID: z.string().default(''),
});

function parse<T extends z.ZodType>(schema: T, source: unknown, scope: string): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid ${scope} environment variables:\n${issues}`);
  }
  return result.data;
}

export const serverEnv = parse(
  serverSchema,
  {
    DATABASE_URL: process.env.DATABASE_URL,
    SENTRY_DSN: process.env.SENTRY_DSN,
    ADMIN_PHONES: process.env.ADMIN_PHONES,
    HYPERPAY_ACCESS_TOKEN: process.env.HYPERPAY_ACCESS_TOKEN,
    HYPERPAY_ENTITY_ID: process.env.HYPERPAY_ENTITY_ID,
    HYPERPAY_MODE: process.env.HYPERPAY_MODE,
    HYPERPAY_BASE_URL: process.env.HYPERPAY_BASE_URL,
    HYPERPAY_TEST_CONNECTOR: process.env.HYPERPAY_TEST_CONNECTOR,
    HYPERPAY_WEBHOOK_SECRET: process.env.HYPERPAY_WEBHOOK_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
    ADMIN_ALERT_EMAIL: process.env.ADMIN_ALERT_EMAIL,
    CRON_SECRET: process.env.CRON_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NODE_ENV: process.env.NODE_ENV,
  },
  'server',
);

export const clientEnv = parse(
  clientSchema,
  {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SNAP_PIXEL_ID: process.env.NEXT_PUBLIC_SNAP_PIXEL_ID,
    NEXT_PUBLIC_TIKTOK_PIXEL_ID: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
  },
  'client',
);

/**
 * Is real Supabase Auth configured? Mirrors the `hasDb()` boundary in
 * spirit: every auth code path checks this and falls back to the
 * stub-session cookie when false. Flips the moment both vars arrive
 * in production — no code change.
 */
export function hasSupabaseAuth(): boolean {
  return Boolean(clientEnv.NEXT_PUBLIC_SUPABASE_URL && clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Is at least one ad pixel (Snapchat / TikTok) configured? Client-safe.
 * Gates the pixel loader and switches the cookie banner from a plain
 * notice into its Accept-all / Essential-only consent mode.
 */
export function hasMarketingPixels(): boolean {
  return Boolean(clientEnv.NEXT_PUBLIC_SNAP_PIXEL_ID || clientEnv.NEXT_PUBLIC_TIKTOK_PIXEL_ID);
}

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
 * Is transactional email (Resend) configured? Same boundary as
 * `hasHyperpay()`: every email send checks this first and is a silent no-op
 * when false, so the booking flow works without it. Flips the moment the API
 * key + verified sender arrive — no code change.
 */
export function hasEmail(): boolean {
  return Boolean(serverEnv.RESEND_API_KEY && serverEnv.RESEND_FROM);
}
