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
  // never silently send live-server flags.
  HYPERPAY_MODE: z.enum(['test', 'live']).default('test'),
  // Optional explicit base URL override; derived from HYPERPAY_MODE when empty.
  HYPERPAY_BASE_URL: z.string().default(''),
  // Shared secret for verifying HyperPay webhook notifications. Empty → the
  // webhook route rejects and we rely on the synchronous status check.
  HYPERPAY_WEBHOOK_SECRET: z.string().default(''),
  // Resend transactional email (booking confirmations / receipts). Optional,
  // same boundary pattern as HyperPay: `hasEmail()` gates every send and the
  // flow is silent (no email) until both arrive — no code change. The API key
  // is a server-only secret; `RESEND_FROM` is the verified sender, e.g.
  // "Gharmish <hello@send.gharmish.com>".
  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM: z.string().default(''),
  // Shared secret for the scheduled release-holds job. Vercel Cron sends it as
  // `Authorization: Bearer <CRON_SECRET>`. Empty → the route rejects every
  // request (the job is inert until configured).
  CRON_SECRET: z.string().default(''),
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
    HYPERPAY_WEBHOOK_SECRET: process.env.HYPERPAY_WEBHOOK_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
    CRON_SECRET: process.env.CRON_SECRET,
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
